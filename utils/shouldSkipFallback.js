const { ignoredErrorCodes } = require('../../shared/ignoredErrorCodes');

// Phase 1: log what would be suppressed without changing behavior.
const SHADOW_MODE = true;

// Deterministic caller-side failures. Every correctly synced node returns these
// regardless of execution client, so the fallback provider cannot do better.
// Matched on code AND message because the clients disagree about the code:
// insufficient funds is -32003 on reth and -32000 on geth/nethermind.
const deterministicCallerErrors = [
  { code: -32003, pattern: /EVM error:\s*OutOfFunds/i },
  { code: -32003, pattern: /insufficient funds for gas \* price \+ value/i },
  { code: -32000, pattern: /insufficient funds for gas \* price \+ value/i },
  { code: -32000, pattern: /insufficient sender balance/i },
];

// Node capability failures that share code -32000 with the list above. An
// archive provider can answer these, our pruned nodes cannot, so they must
// keep reaching the fallback.
const nodeCapabilityPatterns = [
  /historical state .* is not available/i,
  /state at block .* is pruned/i,
  /header not found/i,
];

function shouldSkipFallback(poolError) {
  const error = poolError && poolError.error;
  if (!error) {
    return false;
  }

  if (ignoredErrorCodes.includes(error.code)) {
    return true;
  }

  const message = error.message || '';

  if (nodeCapabilityPatterns.some((pattern) => pattern.test(message))) {
    return false;
  }

  const matched = deterministicCallerErrors.some(
    (candidate) => candidate.code === error.code && candidate.pattern.test(message)
  );

  if (!matched) {
    return false;
  }

  if (SHADOW_MODE) {
    console.log(`🔇 WOULD SKIP FALLBACK: code=${error.code} message=${message}`);
    return false;
  }

  return true;
}

module.exports = { shouldSkipFallback, SHADOW_MODE };
