// Database Manager - SQLite (better-sqlite3, Node runtime)

import Database from 'better-sqlite3';
import { logger } from '../log';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'tee.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create database connection
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.exec('PRAGMA journal_mode = WAL;');

class DbManager {
  private database: Database.Database;

  constructor(database: Database.Database) {
    this.database = database;
  }

  getDatabase(): Database.Database {
    return this.database;
  }

  async connect(): Promise<void> {
    try {
      // Initialize schema
      this.initSchema();
      logger.info('Database connected successfully', 'DbManager');
    } catch (error) {
      logger.error('Failed to connect to database', 'DbManager', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.database.close();
      logger.info('Database disconnected successfully', 'DbManager');
    } catch (error) {
      logger.error('Failed to disconnect from database', 'DbManager', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      this.database.prepare('SELECT 1').get();
      return true;
    } catch (error) {
      logger.error('Database health check failed', 'DbManager', error);
      return false;
    }
  }

  private initSchema(): void {
    // ENS Usernames Table
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS ens_usernames (
        name TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        texts TEXT,
        addresses TEXT,
        contenthash TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Stealth Users Table
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS stealth_users (
        id TEXT PRIMARY KEY,
        ens_username TEXT UNIQUE NOT NULL,
        eoa_address TEXT UNIQUE NOT NULL,
        spending_public_key TEXT,
        viewing_private_key TEXT,
        supported_chains TEXT DEFAULT '[]',
        chain_nonces TEXT DEFAULT '{}',
        modules TEXT DEFAULT '[]',
        eigen_ai_enabled INTEGER DEFAULT 0,
        privacy_enabled INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        zcash_address TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (ens_username) REFERENCES ens_usernames(name)
      );
      CREATE INDEX IF NOT EXISTS idx_stealth_users_eoa_address ON stealth_users(eoa_address);
      CREATE INDEX IF NOT EXISTS idx_stealth_users_ens_username ON stealth_users(ens_username);
    `);

    // Stealth Addresses Table (includes smart account addresses)
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS stealth_addresses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        eoa_address TEXT NOT NULL,
        stealth_nonce INTEGER NOT NULL,
        stealth_address TEXT UNIQUE NOT NULL,
        smart_account_nonce INTEGER NOT NULL,
        smart_account_address TEXT,
        init_data TEXT,
        chain_id INTEGER NOT NULL,
        token_address TEXT,
        token_amount TEXT,
        generated_at TEXT DEFAULT (datetime('now')),
        is_used INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES stealth_users(id) ON DELETE CASCADE
      );
    `);

    // Smart Account Nonces Table (tracks smart account nonces per user/chain)
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS smart_account_nonces (
        user_id TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        nonce INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, chain_id),
        FOREIGN KEY (user_id) REFERENCES stealth_users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_smart_account_nonces_user_id ON smart_account_nonces(user_id);
      CREATE INDEX IF NOT EXISTS idx_smart_account_nonces_chain_id ON smart_account_nonces(chain_id);
    `);

    // Private Routes Table (state for /private-route cross-chain private transfers)
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS private_routes (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        source_chain_id INTEGER NOT NULL,
        dest_chain_id INTEGER NOT NULL,
        hub_chain_id INTEGER NOT NULL,
        token_symbol TEXT NOT NULL DEFAULT 'USDC',
        token_address TEXT NOT NULL,
        dest_token_symbol TEXT,
        dest_token_address TEXT,
        amount TEXT NOT NULL,
        fee_amount TEXT NOT NULL DEFAULT '0',
        quoted_output_amount TEXT NOT NULL DEFAULT '0',
        user_destination_address TEXT NOT NULL,
        hub_account TEXT,
        leg1_request_id TEXT,
        leg1_deposit_address TEXT,
        leg2_request_id TEXT,
        leg2_deposit_address TEXT,
        shield_tx TEXT,
        unshield_tx TEXT,
        error TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_private_routes_status ON private_routes(status);
    `);

    // Run migrations for existing databases
    this.runMigrations();

    // Create indexes after migrations (to ensure all columns exist)
    this.createIndexes();

    logger.info('Database schema initialized', 'DbManager');
  }

  private runMigrations(): void {
    try {
      // Check if stealth_addresses table exists and migrate columns
      const tableInfo = this.database
        .prepare('PRAGMA table_info(stealth_addresses)')
        .all() as Array<{ name: string; type: string }>;

      if (tableInfo.length > 0) {
        const columnNames = tableInfo.map((col) => col.name);

        // Add smart_account_nonce if missing
        if (!columnNames.includes('smart_account_nonce')) {
          this.database.exec(`
            ALTER TABLE stealth_addresses 
            ADD COLUMN smart_account_nonce INTEGER DEFAULT 0;
          `);
          logger.info('Added smart_account_nonce column to stealth_addresses', 'DbManager');
        }

        // Add smart_account_address if missing
        if (!columnNames.includes('smart_account_address')) {
          this.database.exec(`
            ALTER TABLE stealth_addresses 
            ADD COLUMN smart_account_address TEXT;
          `);
          logger.info('Added smart_account_address column to stealth_addresses', 'DbManager');
        }

        // Add init_data if missing
        if (!columnNames.includes('init_data')) {
          this.database.exec(`
            ALTER TABLE stealth_addresses 
            ADD COLUMN init_data TEXT;
          `);
          logger.info('Added init_data column to stealth_addresses', 'DbManager');
        }
      }

      // Check if stealth_users table exists and migrate columns
      const usersTableInfo = this.database
        .prepare('PRAGMA table_info(stealth_users)')
        .all() as Array<{ name: string; type: string }>;

      if (usersTableInfo.length > 0) {
        const userColumnNames = usersTableInfo.map((col) => col.name);

        // Add smart_account_nonces if missing
        if (!userColumnNames.includes('smart_account_nonces')) {
          this.database.exec(`
            ALTER TABLE stealth_users
            ADD COLUMN smart_account_nonces TEXT DEFAULT '{}';
          `);
          logger.info('Added smart_account_nonces column to stealth_users', 'DbManager');
        }
      }

      // Private-route cross-token columns (added after the initial table shipped)
      const prTableInfo = this.database
        .prepare('PRAGMA table_info(private_routes)')
        .all() as Array<{ name: string; type: string }>;
      if (prTableInfo.length > 0) {
        const prColumns = prTableInfo.map((col) => col.name);
        if (!prColumns.includes('dest_token_symbol')) {
          this.database.exec(`ALTER TABLE private_routes ADD COLUMN dest_token_symbol TEXT;`);
          logger.info('Added dest_token_symbol column to private_routes', 'DbManager');
        }
        if (!prColumns.includes('dest_token_address')) {
          this.database.exec(`ALTER TABLE private_routes ADD COLUMN dest_token_address TEXT;`);
          logger.info('Added dest_token_address column to private_routes', 'DbManager');
        }
      }
    } catch (error) {
      logger.error('Migration failed', 'DbManager', error);
      // Don't throw - allow schema to continue
    }
  }

  private createIndexes(): void {
    try {
      // Create indexes for stealth_addresses
      this.database.exec(`
        CREATE INDEX IF NOT EXISTS idx_stealth_addresses_user_id ON stealth_addresses(user_id);
        CREATE INDEX IF NOT EXISTS idx_stealth_addresses_eoa_address ON stealth_addresses(eoa_address);
        CREATE INDEX IF NOT EXISTS idx_stealth_addresses_chain_id ON stealth_addresses(chain_id);
      `);

      // Create index for smart_account_address if column exists
      try {
        const tableInfo = this.database
          .prepare('PRAGMA table_info(stealth_addresses)')
          .all() as Array<{ name: string; type: string }>;
        const columnNames = tableInfo.map((col) => col.name);
        
        if (columnNames.includes('smart_account_address')) {
          this.database.exec(`
            CREATE INDEX IF NOT EXISTS idx_stealth_addresses_smart_account 
            ON stealth_addresses(smart_account_address);
          `);
        }
      } catch (error) {
        // Ignore if column doesn't exist yet
      }
    } catch (error) {
      logger.error('Index creation failed', 'DbManager', error);
      // Don't throw - indexes are not critical for startup
    }
  }

  // Transaction helper
  transaction<T>(callback: () => T): T {
    return this.database.transaction(callback)();
  }
}

// Create and export singleton instance
export const dbManager = new DbManager(db);
export { db };
