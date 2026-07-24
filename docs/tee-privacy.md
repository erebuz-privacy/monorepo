# TEE privacy — hardening the sender↔recipient link

The whole point of the private-route service is that **on-chain**, the sender and
recipient are unlinkable (Circle CCTP moves funds to a hub, Railgun shields +
unshields to a fresh recipient). But the orchestrator's **database** re-creates the
link — one row ties the source deposit → the shield/unshield txs → the recipient
address. Anyone who can read that database can de-anonymize every transfer.

This doc tracks how we close that gap.

## Threat model

| Adversary | Phase 1 (now) | Phase 2 (enclave) |
| --- | --- | --- |
| Stolen DB file / backup / disk snapshot | ✅ protected | ✅ protected |
| Someone who reads the DB directly | ✅ protected | ✅ protected |
| Historical forensics on completed transfers | ✅ link is wiped | ✅ |
| **A malicious operator of the running service** | ❌ they hold the key | ✅ key never leaves the enclave |

**Key honesty point:** you cannot hide data from whoever runs the process using
software alone — they hold the keys and can read memory. True "even the operator
can't reveal it" requires a hardware enclave (Phase 2).

## Phase 1 — software hardening (shipped)

1. **Encrypt the recipient at rest.** `user_destination_address` — the secret half
   of the link — is stored AES-256-GCM encrypted (`src/security/field-crypto.ts`),
   keyed by `ROUTE_ENCRYPTION_KEY`. A raw DB dump shows ciphertext, not an address.
   Rollout is safe over existing plaintext rows (values without the `enc:v1:` prefix
   pass through untouched).
2. **Redact the link on terminal.** When a route reaches `COMPLETED`/`FAILED`, the
   recipient **and** the on-chain trail (`hub_account`, both deposit addresses, the
   burn request ids, and the `shield_tx`/`unshield_tx` correlation) are set to NULL.
   A finished transfer's row therefore can't reveal who was paid or link
   source→shield→unshield→destination. Only non-linking metadata (status, chains,
   amounts) is kept for the status view.

### Setup

```bash
# 32-byte key (production MUST set this; unset = plaintext + a startup warning)
export ROUTE_ENCRYPTION_KEY=$(openssl rand -hex 32)
```

Keep this key OUT of the DB backups. If it's lost, active routes can't be
decrypted (completed ones are already redacted, so nothing to recover there).

## Phase 2 — real enclave (planned)

Run the service inside a hardware confidential-computing enclave (**AWS Nitro
Enclaves** is the pragmatic choice) so the operator is blind:

- **Attested key release.** `ROUTE_ENCRYPTION_KEY` and the Railgun mnemonic/
  encryption key are held in KMS and released **only** to the enclave after it
  proves its identity (attestation document → KMS `Condition` on the enclave PCRs).
  The parent instance / operator can request them but KMS refuses.
- **Sealed storage.** The DB is encrypted with the enclave key; the host only ever
  sees ciphertext on disk.
- **Client-verifiable attestation.** A `/attestation` endpoint returns the enclave's
  signed attestation doc; the app verifies the PCRs (pinned in the client) before
  trusting the service — so a user knows they're talking to the genuine, unmodified
  code, not an operator-tampered copy.
- `field-crypto.ts` is unchanged in Phase 2 — only the **key source** swaps from an
  env var to attested KMS release.
