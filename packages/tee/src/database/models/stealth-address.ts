// StealthAddress Model - SQLite

import { db } from '../../managers/db';

export type StealthAddress = {
  id: string;
  userId: string;
  eoaAddress: string;
  stealthNonce: number; // Nonce for stealth address generation
  stealthAddress: string;
  smartAccountNonce: number; // Nonce for smart account computation
  smartAccountAddress: string | null;
  initData: string | null; // initData used for smart account computation
  chainId: number;
  tokenAddress: string | null;
  tokenAmount: string | null;
  generatedAt: Date;
  isUsed: boolean;
};

type StealthAddressRow = {
  id: string;
  user_id: string;
  eoa_address: string;
  stealth_nonce: number;
  stealth_address: string;
  smart_account_nonce: number;
  smart_account_address: string | null;
  init_data: string | null;
  chain_id: number;
  token_address: string | null;
  token_amount: string | null;
  generated_at: string;
  is_used: number;
};

function rowToStealthAddress(row: StealthAddressRow): StealthAddress {
  return {
    id: row.id,
    userId: row.user_id,
    eoaAddress: row.eoa_address,
    stealthNonce: row.stealth_nonce,
    stealthAddress: row.stealth_address,
    smartAccountNonce: row.smart_account_nonce,
    smartAccountAddress: row.smart_account_address,
    initData: row.init_data,
    chainId: row.chain_id,
    tokenAddress: row.token_address,
    tokenAmount: row.token_amount,
    generatedAt: new Date(row.generated_at),
    isUsed: row.is_used === 1,
  };
}

export interface CreateStealthAddressInput {
  id: string;
  userId: string;
  eoaAddress: string;
  stealthNonce: number; // Nonce for stealth address generation
  stealthAddress: string;
  smartAccountNonce: number; // Nonce for smart account computation
  smartAccountAddress?: string | null;
  initData?: string | null; // initData used for smart account computation
  chainId: number;
  tokenAddress?: string | null;
  tokenAmount?: string | null;
  isUsed?: boolean;
}

export class StealthAddressModel {
  static async create(input: CreateStealthAddressInput): Promise<StealthAddress> {
    // Validate that tokenAddress and tokenAmount are both present or both null
    if ((input.tokenAddress === null) !== (input.tokenAmount === null)) {
      throw new Error('tokenAddress and tokenAmount must be both present or both null');
    }

    // Migrate schema if needed - add new columns
    try {
      db.exec(`
        ALTER TABLE stealth_addresses ADD COLUMN stealth_nonce INTEGER;
        ALTER TABLE stealth_addresses ADD COLUMN smart_account_nonce INTEGER DEFAULT 0;
        ALTER TABLE stealth_addresses ADD COLUMN smart_account_address TEXT;
        ALTER TABLE stealth_addresses ADD COLUMN init_data TEXT;
      `);
      // Migrate existing nonce to stealth_nonce
      db.exec(`
        UPDATE stealth_addresses SET stealth_nonce = nonce WHERE stealth_nonce IS NULL;
      `);
    } catch (e) {
      // Columns already exist or migration not needed, ignore
    }

    const stmt = db.prepare(`
      INSERT INTO stealth_addresses (
        id, user_id, eoa_address, stealth_nonce, stealth_address, 
        smart_account_nonce, smart_account_address, init_data, chain_id,
        token_address, token_amount, is_used
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    const row = stmt.get(
      input.id,
      input.userId,
      input.eoaAddress,
      input.stealthNonce,
      input.stealthAddress,
      input.smartAccountNonce ?? 0,
      input.smartAccountAddress ?? null,
      input.initData ?? null,
      input.chainId,
      input.tokenAddress ?? null,
      input.tokenAmount ?? null,
      input.isUsed ? 1 : 0
    ) as StealthAddressRow;

    return rowToStealthAddress(row);
  }

  static async findByUserId(userId: string): Promise<StealthAddress[]> {
    const stmt = db.prepare(`
      SELECT * FROM stealth_addresses
      WHERE user_id = ?
      ORDER BY generated_at DESC
    `);
    const rows = stmt.all(userId) as StealthAddressRow[];
    return rows.map(rowToStealthAddress);
  }

  static async findByUserIdAndNonce(userId: string, nonce: number): Promise<StealthAddress | null> {
    const stmt = db.prepare(`
      SELECT * FROM stealth_addresses
      WHERE user_id = ? AND stealth_nonce = ?
    `);
    const row = stmt.get(userId, nonce) as StealthAddressRow | null;
    return row ? rowToStealthAddress(row) : null;
  }

  static async findBySmartAccountAddress(smartAccountAddress: string): Promise<StealthAddress | null> {
    const stmt = db.prepare(`
      SELECT * FROM stealth_addresses
      WHERE smart_account_address = ?
    `);
    const row = stmt.get(smartAccountAddress) as StealthAddressRow | null;
    return row ? rowToStealthAddress(row) : null;
  }

  static async findByUserIdAndChain(userId: string, chainId: number): Promise<StealthAddress[]> {
    const stmt = db.prepare(`
      SELECT * FROM stealth_addresses
      WHERE user_id = ? AND chain_id = ?
      ORDER BY generated_at DESC
    `);
    const rows = stmt.all(userId, chainId) as StealthAddressRow[];
    return rows.map(rowToStealthAddress);
  }

  static async update(input: {
    id: string;
    smartAccountNonce?: number;
    smartAccountAddress?: string | null;
    initData?: string | null;
  }): Promise<StealthAddress> {
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.smartAccountNonce !== undefined) {
      updates.push('smart_account_nonce = ?');
      values.push(input.smartAccountNonce);
    }
    if (input.smartAccountAddress !== undefined) {
      updates.push('smart_account_address = ?');
      values.push(input.smartAccountAddress);
    }
    if (input.initData !== undefined) {
      updates.push('init_data = ?');
      values.push(input.initData);
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(input.id);

    const stmt = db.prepare(`
      UPDATE stealth_addresses
      SET ${updates.join(', ')}
      WHERE id = ?
      RETURNING *
    `);

    const row = stmt.get(...values) as StealthAddressRow | null;

    if (!row) {
      throw new Error(`StealthAddress with id ${input.id} not found`);
    }

    return rowToStealthAddress(row);
  }
}
