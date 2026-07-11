// StealthUser Model - SQLite

import { db } from '../../managers/db';
import type { PaginationOptions, PaginatedResult } from '../../types';

export type StealthUser = {
  id: string;
  ensUsername: string;
  eoaAddress: string;
  spendingPublicKey: string | null;
  viewingPrivateKey: string | null;
  supportedChains: number[];
  chainNonces: Record<string, number>; // Stealth address nonces per chain
  smartAccountNonces: Record<string, number>; // Smart account nonces per chain
  modules: unknown[];
  eigenAiEnabled: boolean;
  privacyEnabled: boolean;
  isActive: boolean;
  zcashAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type StealthUserRow = {
  id: string;
  ens_username: string;
  eoa_address: string;
  spending_public_key: string | null;
  viewing_private_key: string | null;
  supported_chains: string;
  chain_nonces: string;
  smart_account_nonces: string;
  modules: string;
  eigen_ai_enabled: number;
  privacy_enabled: number;
  is_active: number;
  zcash_address: string | null;
  created_at: string;
  updated_at: string;
};

function rowToStealthUser(row: StealthUserRow): StealthUser {
  return {
    id: row.id,
    ensUsername: row.ens_username,
    eoaAddress: row.eoa_address,
    spendingPublicKey: row.spending_public_key,
    viewingPrivateKey: row.viewing_private_key,
    supportedChains: JSON.parse(row.supported_chains || '[]'),
    chainNonces: JSON.parse(row.chain_nonces || '{}'),
    smartAccountNonces: JSON.parse(row.smart_account_nonces || '{}'),
    modules: JSON.parse(row.modules || '[]'),
    eigenAiEnabled: row.eigen_ai_enabled === 1,
    privacyEnabled: row.privacy_enabled === 1,
    isActive: row.is_active === 1,
    zcashAddress: row.zcash_address,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface CreateStealthUserInput {
  id: string;
  ensUsername: string;
  eoaAddress: string;
  spendingPublicKey?: string | null;
  viewingPrivateKey?: string | null;
  supportedChains?: number[];
  chainNonces?: Record<string, number>; // Stealth address nonces
  smartAccountNonces?: Record<string, number>; // Smart account nonces
  modules?: unknown[];
  eigenAiEnabled?: boolean;
  privacyEnabled?: boolean;
  isActive?: boolean;
  zcashAddress?: string | null;
}

export class StealthUserModel {
  static async create(input: CreateStealthUserInput): Promise<StealthUser> {
    // Check if smart_account_nonces column exists, if not, add it
    try {
      db.exec(`
        ALTER TABLE stealth_users ADD COLUMN smart_account_nonces TEXT DEFAULT '{}';
      `);
    } catch (e) {
      // Column already exists, ignore
    }

    const stmt = db.prepare(`
      INSERT INTO stealth_users (
        id, ens_username, eoa_address, spending_public_key, viewing_private_key,
        supported_chains, chain_nonces, smart_account_nonces, modules, eigen_ai_enabled, privacy_enabled, is_active, zcash_address
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    const row = stmt.get(
      input.id,
      input.ensUsername,
      input.eoaAddress,
      input.spendingPublicKey ?? null,
      input.viewingPrivateKey ?? null,
      JSON.stringify(input.supportedChains ?? []),
      JSON.stringify(input.chainNonces ?? {}),
      JSON.stringify(input.smartAccountNonces ?? {}),
      JSON.stringify(input.modules ?? []),
      input.eigenAiEnabled ? 1 : 0,
      input.privacyEnabled ? 1 : 0,
      input.isActive !== false ? 1 : 0,
      input.zcashAddress ?? null
    ) as StealthUserRow;

    return rowToStealthUser(row);
  }

  static async findByEoaAddress(
    eoaAddress: string,
    isActive?: boolean
  ): Promise<StealthUser | null> {
    let query = 'SELECT * FROM stealth_users WHERE eoa_address = ?';
    const params: (string | number)[] = [eoaAddress];

    if (isActive !== undefined) {
      query += ' AND is_active = ?';
      params.push(isActive ? 1 : 0);
    }

    const stmt = db.prepare(query);
    const row = stmt.get(...params) as StealthUserRow | null;
    return row ? rowToStealthUser(row) : null;
  }

  static async findByEnsUsername(ensUsername: string): Promise<StealthUser | null> {
    const stmt = db.prepare('SELECT * FROM stealth_users WHERE ens_username = ? AND is_active = 1');
    const row = stmt.get(ensUsername) as StealthUserRow | null;
    return row ? rowToStealthUser(row) : null;
  }

  static async findByName(ensUsername: string): Promise<StealthUser | null> {
    const stmt = db.prepare('SELECT * FROM stealth_users WHERE ens_username = ?');
    const row = stmt.get(ensUsername) as StealthUserRow | null;
    return row ? rowToStealthUser(row) : null;
  }

  static async getCurrentNonce(userId: string, chainId: number): Promise<number> {
    const stmt = db.prepare('SELECT chain_nonces FROM stealth_users WHERE id = ?');
    const row = stmt.get(userId) as { chain_nonces: string } | null;

    if (!row) {
      throw new Error(`StealthUser with id ${userId} not found`);
    }

    const chainNonces: Record<string, number> = JSON.parse(row.chain_nonces || '{}');
    const chainIdStr = chainId.toString();

    return chainNonces[chainIdStr] ?? 0;
  }

  static async getCurrentSmartAccountNonce(userId: string, chainId: number): Promise<number> {
    const stmt = db.prepare('SELECT smart_account_nonces FROM stealth_users WHERE id = ?');
    const row = stmt.get(userId) as { smart_account_nonces: string } | null;

    if (!row) {
      throw new Error(`StealthUser with id ${userId} not found`);
    }

    const smartAccountNonces: Record<string, number> = JSON.parse(row.smart_account_nonces || '{}');
    const chainIdStr = chainId.toString();

    return smartAccountNonces[chainIdStr] ?? 0;
  }

  static async updateSmartAccountNonces(
    userId: string,
    smartAccountNonces: Record<string, number>
  ): Promise<StealthUser> {
    const stmt = db.prepare(`
      UPDATE stealth_users
      SET smart_account_nonces = ?, updated_at = datetime('now')
      WHERE id = ?
      RETURNING *
    `);

    const row = stmt.get(JSON.stringify(smartAccountNonces), userId) as StealthUserRow | null;

    if (!row) {
      throw new Error(`StealthUser with id ${userId} not found`);
    }

    return rowToStealthUser(row);
  }

  static async updateChainNonces(
    userId: string,
    chainNonces: Record<string, number>
  ): Promise<StealthUser> {
    const stmt = db.prepare(`
      UPDATE stealth_users
      SET chain_nonces = ?, updated_at = datetime('now')
      WHERE id = ?
      RETURNING *
    `);

    const row = stmt.get(JSON.stringify(chainNonces), userId) as StealthUserRow | null;

    if (!row) {
      throw new Error(`StealthUser with id ${userId} not found`);
    }

    return rowToStealthUser(row);
  }

  static async updateChainsAndNonces(
    userId: string,
    supportedChains: number[],
    chainNonces: Record<string, number>
  ): Promise<StealthUser> {
    const stmt = db.prepare(`
      UPDATE stealth_users
      SET supported_chains = ?, chain_nonces = ?, updated_at = datetime('now')
      WHERE id = ?
      RETURNING *
    `);

    const row = stmt.get(
      JSON.stringify(supportedChains),
      JSON.stringify(chainNonces),
      userId
    ) as StealthUserRow | null;

    if (!row) {
      throw new Error(`StealthUser with id ${userId} not found`);
    }

    return rowToStealthUser(row);
  }

  static async findAll(
    options: PaginationOptions = { page: 1, pageSize: 10 }
  ): Promise<PaginatedResult<StealthUser>> {
    const { page, pageSize } = options;
    const offset = (page - 1) * pageSize;

    const countStmt = db.prepare('SELECT COUNT(*) as count FROM stealth_users');
    const { count: total } = countStmt.get() as { count: number };

    const dataStmt = db.prepare(`
      SELECT * FROM stealth_users
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    const rows = dataStmt.all(pageSize, offset) as StealthUserRow[];

    const totalPages = Math.ceil(total / pageSize);

    return {
      data: rows.map(rowToStealthUser),
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  static async findAllActive(): Promise<StealthUser[]> {
    const stmt = db.prepare('SELECT * FROM stealth_users WHERE is_active = 1');
    const rows = stmt.all() as StealthUserRow[];
    return rows.map(rowToStealthUser);
  }
}
