// PrivateRoute Model - SQLite
// Persisted state for the /private-route cross-chain private transfer orchestration.

import { db } from '../../managers/db';

export type PrivateRouteStatus =
  | 'AWAITING_DEPOSIT' // waiting for user to send funds to the leg-1 deposit address
  | 'BRIDGING_IN' // Relay leg-1 in flight (Base -> hub SA)
  | 'RECEIVED_ON_HUB' // funds arrived at the hub smart account
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
  tokenSymbol: string; // source token symbol (also shielded on the hub)
  tokenAddress: string; // source token address on the hub chain
  destTokenSymbol: string; // destination token symbol delivered to the user
  destTokenAddress: string | null; // destination token address on the dest chain
  amount: string; // requested input amount, source token smallest unit (bigint-as-string)
  feeAmount: string; // route fee (spread), source token smallest unit (bigint-as-string)
  quotedOutputAmount: string; // guaranteed output the user confirmed, DEST token smallest unit
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
  token_symbol: string;
  token_address: string;
  dest_token_symbol: string | null;
  dest_token_address: string | null;
  amount: string;
  fee_amount: string;
  quoted_output_amount: string;
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
    tokenSymbol: row.token_symbol,
    tokenAddress: row.token_address,
    destTokenSymbol: row.dest_token_symbol ?? row.token_symbol,
    destTokenAddress: row.dest_token_address,
    amount: row.amount,
    feeAmount: row.fee_amount ?? '0',
    quotedOutputAmount: row.quoted_output_amount ?? '0',
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
  tokenSymbol: string;
  tokenAddress: string;
  destTokenSymbol?: string | null;
  destTokenAddress?: string | null;
  amount: string;
  feeAmount?: string | null;
  quotedOutputAmount?: string | null;
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
        token_symbol, token_address, dest_token_symbol, dest_token_address,
        amount, fee_amount, quoted_output_amount,
        user_destination_address, hub_account,
        leg1_request_id, leg1_deposit_address
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    const row = stmt.get(
      input.id,
      input.status,
      input.sourceChainId,
      input.destChainId,
      input.hubChainId,
      input.tokenSymbol,
      input.tokenAddress,
      input.destTokenSymbol ?? input.tokenSymbol,
      input.destTokenAddress ?? null,
      input.amount,
      input.feeAmount ?? '0',
      input.quotedOutputAmount ?? '0',
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
