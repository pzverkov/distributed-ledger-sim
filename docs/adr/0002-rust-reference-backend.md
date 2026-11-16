# ADR 0002: Rust is the reference backend

Status: accepted
Date: 2026-11-16

## Context

Two backends serve one HTTP API (validated against `api/openapi.yaml` in CI). Rust is ahead on messaging and ops: broker seam with Redpanda, analytics consumer group, dead-letter queue, retention, continuous reconciliation, and trace propagation across the broker. Go lacks those. The README called Go the primary implementation, which no longer matched the code.

The head-to-head in `docs/benchmarks.md` does not separate them. On representative traffic both sustain 1000 req/s, Go has the lower median (2.0 vs 3.6 ms) and Rust the tighter tail (p99 22 vs 310 ms). On a single hot account pair Go wins, but that measures row-lock hold time, not engine speed, and the research in `docs/rust-performance-research.md` traces the Rust gap to fixable statement ordering.

## Options considered

- **Full parity.** Port the missing messaging and ops features to Go. Keeps both backends equal, but every future messaging change is written twice.
- **Rust as the reference (chosen).** Rust owns messaging, ops and anything operators depend on. Go stays a compatible HTTP implementation.
- **Drop one backend.** Halves maintenance but removes the cross-language contract validation that catches drift in the API and the deterministic throttle hash.

## Decision

Rust is the reference backend. New messaging and ops features land in Rust first and are not required in Go. Go keeps full HTTP API parity and the shared throttle-hash parity test, both enforced in CI.

## Consequences

- The Go gaps listed in `docs/parity-matrix.md` are intentional, not backlog debt. Go is the right pick for deployments that only need the ledger and operator API.
- Features that need messaging or reconciliation (for example the console reconciliation panel) ship against Rust and show "not available" on Go.
- Revisit if a Go-only audience appears or the Go gap starts costing contract-test coverage.
