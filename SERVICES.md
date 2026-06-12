# GrantStream Indexer & Verifier Services

This workspace contains two Rust services that connect the on-chain indexer to the off-chain verifier via `tokio::sync::mpsc`.

## Architecture

```
Blockchain (MilestoneSubmitted event)
        │
        ▼
  [ Indexer Service ] ──── mpsc channel ────▶ [ Verifier Service ]
   - Subscribes to WS provider                  - HTTP API /verify
   - Persists pending jobs to SQLite            - Runs validation logic
   - Sends jobs to verifier                     - Writes results to SQLite
```

## Services

### indexer
- Connects to the blockchain via WebSocket
- Listens for `MilestoneSubmitted` events from `GrantStreamEscrow`
- Inserts pending verification jobs into SQLite
- Enqueues jobs onto the `tokio::sync::mpsc` channel
- Forwards jobs to the verifier HTTP API

### verifier
- Exposes a POST `/verify` endpoint
- Consumes jobs from the channel
- Validates the `evidenceURI` (IPFS, HTTPS, ar://, data:)
- Updates the SQLite record with `Approved`/`Rejected` and a timestamp

## Run

```bash
# Terminal 1
cd indexer
cargo run

# Terminal 2
cd verifier
cargo run
```

## Database

Both services maintain a `milestone_verifications` table keyed by `(grant_id, milestone_id)`:
- `submitted_at` — when the event was indexed
- `verified_at` — when the verifier finished processing
- `status` — `Pending`, `Approved`, or `Rejected`
- `result_reason` — rejection reason if applicable
