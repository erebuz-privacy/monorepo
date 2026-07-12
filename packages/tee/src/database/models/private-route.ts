// PrivateRoute Model - SQLite
// Persisted state for the /private-route cross-chain private transfer orchestration.

import { db } from '../../managers/db';

export type PrivateRouteStatus =
  | 'AWAITING_DEPOSIT' // waiting for user to send funds to the leg-1 deposit address
  | 'BRIDGING_IN' // Relay leg-1 in flight (Base -> hub SA)
  | 'RECEIVED_ON_HUB' // funds arrived at the hub smart account
  | 'EXTRACTED' // funds moved SA -> TEE EOA (ready to shield)
  | 'SHIELDED' // funds shielded into Railgun
  | 'UNSHIELD_SENT' // unshield tx sent to the leg-2 deposit address
  | 'BRIDGING_OUT' // Relay leg-2 in flight (hub -> destination)
  | 'COMPLETED' // funds delivered on destination chain
  | 'FAILED';

export const TERMINAL_STATUSES: PrivateRouteStatus[] = ['COMPLETED', 'FAILED'];

export type PrivateRoute = {
  id: string;
  status: PrivateRouteStatus;
  sourceChainId: number;
  destChainId: number;
  hubChainId: number;
  tokenAddress: string; // token address on the hub chain
  amount: string; // requested input amount, smallest unit (bigint-as-string)
  userDestinationAddress: string;
  hubAccount: string | null; // TEE-owned smart account on the hub chain
  leg1RequestId: string | null;
  leg1DepositAddress: string | null;
  leg2RequestId: string | null;
  leg2DepositAddress: string | null;
  shieldTx: string | null;
  unshieldTx: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PrivateRouteRow = {
  id: string;
  status: string;
  source_chain_id: number;
  dest_chain_id: number;
  hub_chain_id: number;
  token_address: string;
  amount: string;
  user_destination_address: string;
  hub_account: string | null;
  leg1_request_id: string | null;
  leg1_deposit_address: string | null;
  leg2_request_id: string | null;
  leg2_deposit_address: string | null;
  shield_tx: string | null;
  unshield_tx: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

function rowToPrivateRoute(row: PrivateRouteRow): PrivateRoute {
  return {
    id: row.id,
    status: row.status as PrivateRouteStatus,
    sourceChainId: row.source_chain_id,
    destChainId: row.dest_chain_id,
    hubChainId: row.hub_chain_id,
    tokenAddress: row.token_address,
    amount: row.amount,
    userDestinationAddress: row.user_destination_address,
    hubAccount: row.hub_account,
    leg1RequestId: row.leg1_request_id,
    leg1DepositAddress: row.leg1_deposit_address,
    leg2RequestId: row.leg2_request_id,
    leg2DepositAddress: row.leg2_deposit_address,
    shieldTx: row.shield_tx,
    unshieldTx: row.unshield_tx,
    error: row.error,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface CreatePrivateRouteInput {
  id: string;
  status: PrivateRouteStatus;
  sourceChainId: number;
  destChainId: number;
  hubChainId: number;
  tokenAddress: string;
  amount: string;
  userDestinationAddress: string;
  hubAccount?: string | null;
  leg1RequestId?: string | null;
  leg1DepositAddress?: string | null;
}

// Columns that update() is allowed to set, mapping camelCase -> snake_case.
const UPDATABLE_COLUMNS: Record<string, string> = {
  status: 'status',
  hubAccount: 'hub_account',
  leg1RequestId: 'leg1_request_id',
  leg1DepositAddress: 'leg1_deposit_address',
  leg2RequestId: 'leg2_request_id',
  leg2DepositAddress: 'leg2_deposit_address',
  shieldTx: 'shield_tx',
  unshieldTx: 'unshield_tx',
  error: 'error',
};

export class PrivateRouteModel {
  static async create(input: CreatePrivateRouteInput): Promise<PrivateRoute> {
    const stmt = db.prepare(`
      INSERT INTO private_routes (
        id, status, source_chain_id, dest_chain_id, hub_chain_id,
        token_address, amount, user_destination_address, hub_account,
        leg1_request_id, leg1_deposit_address
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    const row = stmt.get(
      input.id,
      input.status,
      input.sourceChainId,
      input.destChainId,
      input.hubChainId,
      input.tokenAddress,
      input.amount,
      input.userDestinationAddress,
      input.hubAccount ?? null,
      input.leg1RequestId ?? null,
      input.leg1DepositAddress ?? null
    ) as PrivateRouteRow;

    return rowToPrivateRoute(row);
  }

  static async findById(id: string): Promise<PrivateRoute | null> {
    const row = db.prepare(`SELECT * FROM private_routes WHERE id = ?`).get(id) as
      | PrivateRouteRow
      | null;
    return row ? rowToPrivateRoute(row) : null;
  }

  /** All routes not in a terminal status, oldest first (for the poller). */
  static async findNonTerminal(): Promise<PrivateRoute[]> {
    const placeholders = TERMINAL_STATUSES.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `SELECT * FROM private_routes WHERE status NOT IN (${placeholders}) ORDER BY created_at ASC`
      )
      .all(...TERMINAL_STATUSES) as PrivateRouteRow[];
    return rows.map(rowToPrivateRoute);
  }

  static async update(
    id: string,
    fields: Partial<Record<keyof typeof UPDATABLE_COLUMNS, string | null>>
  ): Promise<PrivateRoute> {
    const setClauses: string[] = [];
    const values: (string | null)[] = [];

    for (const [key, column] of Object.entries(UPDATABLE_COLUMNS)) {
      const value = (fields as Record<string, string | null | undefined>)[key];
      if (value !== undefined) {
        setClauses.push(`${column} = ?`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No fields to update');
    }

    setClauses.push(`updated_at = datetime('now')`);
    values.push(id);

    const row = db
      .prepare(`UPDATE private_routes SET ${setClauses.join(', ')} WHERE id = ? RETURNING *`)
      .get(...values) as PrivateRouteRow | null;

    if (!row) {
      throw new Error(`PrivateRoute with id ${id} not found`);
    }

    return rowToPrivateRoute(row);
  }
}
