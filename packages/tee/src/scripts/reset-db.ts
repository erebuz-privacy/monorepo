#!/usr/bin/env bun

/**
 * Database Reset Script
 * 
 * Resets the database by deleting all data and reinitializing the schema
 * 
 * Usage:
 *   bun run src/scripts/reset-db.ts
 * 
 * Options:
 *   --confirm, -y    Skip confirmation prompt
 *   --help, -h       Show help message
 */

import path from 'path';
import fs from 'fs';
import { Database } from 'bun:sqlite';
import { logger } from '../managers/log';

// Get database path (same as in db manager)
const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'tee.db');
const dbDir = path.dirname(dbPath);

// WAL files that need to be deleted
const walFiles = [
  dbPath,
  `${dbPath}-shm`,
  `${dbPath}-wal`,
];

/**
 * Initialize database schema (same as DbManager.initSchema)
 */
function initSchema(database: Database): void {
  // ENS Usernames Table
  database.exec(`
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
  database.exec(`
    CREATE TABLE IF NOT EXISTS stealth_users (
      id TEXT PRIMARY KEY,
      ens_username TEXT UNIQUE NOT NULL,
      eoa_address TEXT UNIQUE NOT NULL,
      spending_public_key TEXT,
      viewing_private_key TEXT,
      supported_chains TEXT DEFAULT '[]',
      chain_nonces TEXT DEFAULT '{}',
      smart_account_nonces TEXT DEFAULT '{}',
      modules TEXT DEFAULT '[]',
      eigen_ai_enabled INTEGER DEFAULT 0,
      privacy_enabled INTEGER DEFAULT 1,
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
  database.exec(`
    CREATE TABLE IF NOT EXISTS stealth_addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      eoa_address TEXT NOT NULL,
      stealth_nonce INTEGER NOT NULL,
      stealth_address TEXT UNIQUE NOT NULL,
      smart_account_nonce INTEGER,
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

  // Create indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_stealth_addresses_user_id ON stealth_addresses(user_id);
    CREATE INDEX IF NOT EXISTS idx_stealth_addresses_eoa_address ON stealth_addresses(eoa_address);
    CREATE INDEX IF NOT EXISTS idx_stealth_addresses_chain_id ON stealth_addresses(chain_id);
  `);

  // Create index for smart_account_address if column exists
  try {
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_stealth_addresses_smart_account 
      ON stealth_addresses(smart_account_address);
    `);
  } catch (error) {
    // Ignore if column doesn't exist yet
  }

  // Smart Account Nonces Table (tracks smart account nonces per user/chain)
  database.exec(`
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
}

/**
 * Reset the database
 */
async function resetDatabase(): Promise<void> {
  console.log('🗑️  Resetting database...');
  console.log(`   Database path: ${dbPath}`);

  // Close any existing connections by trying to close the database if it exists
  try {
    // Try to close the database file if it's open
    const testDb = new Database(dbPath, { create: false });
    testDb.close();
  } catch (error) {
    // Database might not exist or might be locked - that's okay
  }

  // Delete all database files
  let deletedCount = 0;
  for (const filePath of walFiles) {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`   ✅ Deleted: ${path.basename(filePath)}`);
        deletedCount++;
      } catch (error) {
        console.error(`   ❌ Failed to delete ${path.basename(filePath)}:`, error);
        throw error;
      }
    }
  }

  if (deletedCount === 0) {
    console.log('   ℹ️  No database files found to delete');
  }

  // Ensure data directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`   ✅ Created data directory: ${dbDir}`);
  }

  // Create new database and initialize schema
  console.log('📦 Creating new database...');
  const db = new Database(dbPath, { create: true });
  
  // Enable WAL mode
  db.exec('PRAGMA journal_mode = WAL;');
  
  // Initialize schema
  console.log('🔧 Initializing schema...');
  initSchema(db);
  
  // Close the database
  db.close();
  
  console.log('✅ Database reset and reinitialized successfully!');
  console.log(`   Database location: ${dbPath}`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  let skipConfirm = false;
  
  for (const arg of args) {
    switch (arg) {
      case '--confirm':
      case '-y':
        skipConfirm = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Database Reset Script

Usage:
  bun run src/scripts/reset-db.ts [options]

Options:
  --confirm, -y    Skip confirmation prompt (dangerous!)
  --help, -h       Show this help message

Environment Variables:
  DATABASE_PATH    Custom database path (default: ./data/tee.db)

Warning:
  This will DELETE ALL DATA in the database!
  Make sure you have backups if needed.

Examples:
  # Reset database with confirmation
  bun run src/scripts/reset-db.ts

  # Reset database without confirmation
  bun run src/scripts/reset-db.ts --confirm
`);
        process.exit(0);
        break;
    }
  }

  // Confirm before proceeding
  if (!skipConfirm) {
    console.log('⚠️  WARNING: This will DELETE ALL DATA in the database!');
    console.log(`   Database: ${dbPath}`);
    console.log('');
    console.log('Press Ctrl+C to cancel, or run with --confirm to skip this prompt.');
    console.log('');
    
    // Wait a bit for user to see the warning
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  try {
    await resetDatabase();
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to reset database:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

