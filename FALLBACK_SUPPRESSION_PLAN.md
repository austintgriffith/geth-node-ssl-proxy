# Reducing pointless fallback traffic

## Problem

Pool errors that are deterministic caller-side failures (the sender cannot afford
the transaction) are being treated as pool failures and retried against the
fallback provider. The fallback returns the same error, because every correctly
synced node returns the same answer. The retries cost Infura quota and, when a
dapp submits a batch at once, trip Infura's per-second edge limit. The resulting
HTTP 429 body is not JSON-RPC shaped, so `handleRequest` flattens it into
`-70000 "Internal Proxy service error"` with `data: "Too Many Requests"`.

Peak fallback volume was 160 requests in a day, so this is a burst limit rather
than a quota. `eth_estimateGas` accounts for 67 of the 78 observed throttles.

## Why error code alone is not enough

Three execution clients are in the pool (12 Reth, 2 Geth, 1 Nethermind at time of
writing). They disagree about which code carries which condition, and the same
code carries conditions that need opposite handling.

Insufficient funds arrives four ways:

| Wording                                          | Client     | Code     |
| ------------------------------------------------ | ---------- | -------- |
| `EVM error: OutOfFunds`                          | Reth       | `-32003` |
| `insufficient funds for gas * price + value: have ... want ...` | Reth | `-32003` |
| `insufficient funds for gas * price + value: address 0x...`     | Geth | `-32000` |
| `insufficient sender balance for transfer`       | Nethermind | `-32000` |

Meanwhile `-32000` also carries `historical state ... is not available`, where
the fallback is the correct action because an archive provider can answer what a
pruned node cannot. Suppressing all of `-32000` would break 52 requests that
work today.

Message text was checked for version drift across July-September 2026, a window
covering node upgrades. No node changed its wording for a given condition; new
signatures only ever appeared as additions. Codes moved, wording did not.

## Design

Match on code **and** message, defaulting to fallback. Suppression happens only
on a positive match, so an unrecognized error - a new client, a new version,
reworded text - behaves exactly as it does today. A wording change costs some
pointless fallbacks again; it cannot cause a user-facing failure.

This asymmetry is the point. Code-only matching fails open into breakage.
Code-plus-message fails closed into merely suboptimal.

## Scope

| Item           | Detail                                                        |
| -------------- | ------------------------------------------------------------- |
| Repo           | `bg-rpc-proxy`                                                 |
| New file       | `bg-rpc-proxy/utils/shouldSkipFallback.js`                     |
| Edited         | `bg-rpc-proxy/proxy.js`, three `else if` blocks                |
| Untouched      | `shared/`, `bg-rpc-pool`, `bg-rpc-logs`, `bg-rpc-web-server`, `bg-rpc-watchdog` |
| Restart needed | `pm2 restart proxy` only                                       |

`shared/ignoredErrorCodes.js` is deliberately left alone. It is not version
controlled, and it feeds `handleRequestSet`, where adding a code would let the
first node returning that code resolve the request for every other node.

## Match table

Suppress (136 of 208 observed events):

| Code     | Message                                  | Client     | Hits |
| -------- | ---------------------------------------- | ---------- | ---- |
| `-32003` | `EVM error: OutOfFunds`                  | Reth       | 65   |
| `-32003` | `insufficient funds ...: have/want`      | Reth       | 22   |
| `-32000` | `insufficient funds ...: address 0x`     | Geth       | 37   |
| `-32000` | `insufficient sender balance`            | Nethermind | 12   |

Preserve, must keep reaching the fallback:

| Code     | Message                                | Hits |
| -------- | -------------------------------------- | ---- |
| `-32000` | `historical state ... is not available` | 52   |
| `-32603` | `state at block #N is pruned`           | 169  |
| `-32000` | `header not found`                      | 2    |
| `-69003` | `All nodes failed to respond`           | 18   |

Excluded from phase 1, revisit later: stack over/underflow (16 events, spread
across both codes and three wordings) and `in-flight transaction limit` (2,
possibly transient).

## Rollout

1. **Shadow mode.** Predicate runs and logs `WOULD SKIP FALLBACK` but changes
   nothing. Every request still falls back. Run 24-48 hours.
2. **Enable.** Flip `SHADOW_MODE` to `false` once the shadow log shows only
   intended matches. One-line commit.
3. **Drift alarm.** Log unmatched pool errors with their signature so a client
   upgrade that rewords a message surfaces as a log line rather than a rising
   bill.

## Verification

Replay the historical corpus through the predicate offline and assert both:

- it matches all 136 targets
- it matches **zero** node-capability errors

The second assertion is the one that matters. A false positive there turns a
working request into a user-facing failure.

After enabling, watch `fallbackRequests.log` for a drop in `eth_estimateGas`
volume with no new error classes, and confirm `historical state` and `pruned`
entries still appear.

## Rollback

`git checkout` the branch point and `pm2 restart proxy`. No shared state, no
schema, no other service. Shadow mode is a no-op and carries no rollback risk.

## Out of scope

Infura 429s themselves, the expired `/home/ubuntu/server.cert`, the stale
`/etc/hosts` pin for `pool.mainnet.rpc.buidlguidl.com`, the commented-out
`-32603` TODO in `shared/ignoredErrorCodes.js`, and the `forEach` on null crash
in `pool-error.log`.
