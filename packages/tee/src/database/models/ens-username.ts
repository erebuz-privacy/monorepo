// EnsUsername Model - SQLite

import { db } from '../../managers/db';
import type { PaginationOptions, PaginatedResult } from '../../types';

export type EnsUsername = {
  name: string;
  owner: string;
  texts: string | null;
  addresses: string | null;
  contenthash: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type EnsUsernameRow = {
  name: string;
  owner: string;
  texts: string | null;
  addresses: string | null;
  contenthash: string | null;
  created_at: string;
  updated_at: string;
};

function rowToEnsUsername(row: EnsUsernameRow): EnsUsername {
  return {
    name: row.name,
    owner: row.owner,
    texts: row.texts,
    addresses: row.addresses,
    contenthash: row.contenthash,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface CreateEnsUsernameInput {
  name: string;
  owner: string;
  texts?: string | null;
  addresses?: string | null;
  contenthash?: string | null;
}

export class EnsUsernameModel {
  static async create(input: CreateEnsUsernameInput): Promise<EnsUsername> {
    const stmt = db.prepare(`
      INSERT INTO ens_usernames (name, owner, texts, addresses, contenthash)
      VALUES (?, ?, ?, ?, ?)
      RETURNING *
    `);

    const row = stmt.get(
      input.name,
      input.owner,
      input.texts ?? null,
      input.addresses ?? null,
      input.contenthash ?? null
    ) as EnsUsernameRow;

    return rowToEnsUsername(row);
  }

  static async findByName(name: string): Promise<EnsUsername | null> {
    const stmt = db.prepare('SELECT * FROM ens_usernames WHERE name = ?');
    const row = stmt.get(name) as EnsUsernameRow | null;
    return row ? rowToEnsUsername(row) : null;
  }

  static async remove(name: string): Promise<EnsUsername> {
    const existing = await this.findByName(name);
    if (!existing) {
      throw new Error(`ENS username ${name} not found`);
    }

    const stmt = db.prepare('DELETE FROM ens_usernames WHERE name = ?');
    stmt.run(name);

    return existing;
  }

  static async findAll(
    options: PaginationOptions = { page: 1, pageSize: 10 }
  ): Promise<PaginatedResult<EnsUsername>> {
    const { page, pageSize } = options;
    const offset = (page - 1) * pageSize;

    const countStmt = db.prepare('SELECT COUNT(*) as count FROM ens_usernames');
    const { count: total } = countStmt.get() as { count: number };

    const dataStmt = db.prepare(`
      SELECT * FROM ens_usernames
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    const rows = dataStmt.all(pageSize, offset) as EnsUsernameRow[];

    const totalPages = Math.ceil(total / pageSize);

    return {
      data: rows.map(rowToEnsUsername),
      total,
      page,
      pageSize,
      totalPages,
    };
  }
}
