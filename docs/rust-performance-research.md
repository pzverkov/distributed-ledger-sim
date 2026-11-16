# Rust backend performance research

Where the Rust backend can get faster, ranked by expected gain per effort. Source: a read of `rust/sim/src/handlers/transfers.rs`, `messaging/store.rs`, `messaging/outbox.rs` and `main.rs`, against the benchmarks in `docs/benchmarks.md`. **Nothing here is measured yet.** Each item names the experiment that confirms or kills it. Keep a change only if it moves the number it targets.

## What the benchmarks point at

On a single hot account pair Rust serializes at p50 about 1 s while Go holds p50 at 4.6 ms. The benchmark notes say this measures lock-hold time. Reading the write path explains why: in `apply_transfer_inner` the two `balances` upserts take the row locks, and the outbox insert, JSON build, trace capture and commit all run after them. Every round trip between the first upsert and the commit extends the lock hold, and under contention that queue is the whole latency.

## Ranked hypotheses

### 1. Take the row locks last (highest value, small change)

Reorder `apply_transfer_inner` so the two `balances` upserts are the final statements before `commit`: insert the transaction, postings and outbox row first, upsert balances last. Lock hold drops from about five statements to one statement plus the commit.

- Expected effect: large on the hot-pair workload, small on representative traffic.
- Risk: none for correctness; the same rows change in the same transaction.
- Experiment: rerun the hot-pair benchmark (`ACCTS=1`, 3 trials, median) before and after.

### 2. Stop preparing every statement on every call

Handlers pass SQL as `&str` to `tx.execute`, `query_one` and `query_opt`. With tokio-postgres a `&str` is prepared before it is executed, which costs an extra round trip per statement, and the prepared statement is thrown away. A transfer runs about 13 statements, so this may be roughly half of its round trips. Use deadpool's `prepare_cached` so each statement is parsed once per connection.

- Expected effect: fewer round trips on every request, both workloads.
- Risk: low; statement text is already static.
- Experiment: count round trips per transfer with `pg_stat_statements` or a tracing proxy, then rerun both workloads.

### 3. Pipeline independent statements

The two `accounts` upserts, the two `balances` upserts and the postings insert do not depend on each other's results. tokio-postgres pipelines futures issued concurrently on one connection, so `futures::try_join!` over them removes sequential waits. Do the balances pair as a join too, ordered by account id.

- Expected effect: moderate, and it stacks with 1 and 2.
- Risk: moderate; errors and ordering need care inside one transaction.
- Experiment: same as item 2.

### 4. One statement for the whole write

A single SQL statement with data-modifying CTEs can create accounts, insert the transaction and postings, upsert both balances and write the outbox row in one round trip. This is the ceiling for round-trip reduction.

- Expected effect: largest per-request gain, but only worth it after 1 to 3 are measured.
- Risk: higher; the SQL is harder to read and test, and the idempotency conflict path needs its own handling. Keep it only if the gain over 1 to 3 is clear.

### 5. Order the balance updates to avoid deadlocks

`apply_transfer_inner` updates the sender's balance first, then the receiver's. Two concurrent transfers in opposite directions (A to B and B to A) can each hold one row and wait on the other, and Postgres will abort one with a deadlock error. I found no deadlock handling or retry in either backend. Update balances in sorted account-id order, and retry once on SQLSTATE 40P01.

- Expected effect: removes a correctness-under-load failure mode that also shows up as tail latency.
- Experiment: a test that fires opposing transfers between two accounts concurrently and asserts zero errors.

### 6. Raise the outbox publisher ceiling

The publisher relays 50 rows every 250 ms and publishes and marks each row one at a time, a ceiling of about 200 events/s regardless of broker (documented in `docs/benchmarks.md`). Options, in order: loop immediately while a batch comes back full instead of waiting for the next tick, mark the whole batch with one `UPDATE ... WHERE id = ANY($1)`, and publish to JetStream asynchronously and wait for acks in bulk. Keep the claim and mark in one transaction so multi-replica behavior stays correct.

- Expected effect: drain rate rises well above 200 events/s, so the `outbox_backlog` peak falls.
- Risk: moderate; bulk acks change the failure path, so the poison-event and redelivery tests must still pass.
- Experiment: `pipeline_lag.sh` with a faster load generator (the curl harness is also a ceiling, per the benchmark notes).

### 7. Revisit connection recycling on the representative workload

The pool uses `Verified` recycling, which runs a check query on every checkout. The hot-pair run showed that `Fast` plus 32 connections made contention worse, but that was one workload. Measure `Fast` at 16 connections on `ACCTS=500`, where there is no hot row and one fewer round trip per request may help. Keep `Verified` if it changes nothing, since it protects against stale connections after a DB failover.

### 8. Release build profile (low value here)

`Cargo.toml` has no `[profile.release]` settings. `lto = "fat"` and `codegen-units = 1` help CPU-bound code, and this service is database-bound, so expect little. Cheap to try, so do it last and keep it only if the benchmark moves.

## Suggested order

1 then 2 then 5 (cheap and measurable), then 3, then 6. Hold 4 until the earlier steps are measured. Record every run in `docs/benchmarks.md` with hardware, three-trial medians, and the unchanged-workload baseline.

## Out of scope

Go tuning, broker choice (see ADR 0001), and horizontal scaling. The first two do not change the write path, and the third needs a different benchmark.
