/**
 * Detects hardcoded secrets in MCP env values.
 * Used by migration (auto-extract), sync (guard), and `env extract` command.
 */

export interface SecretFinding {
  mcpName: string;
  key: string;
  value: string;
}

/** Known secret key name patterns (case-insensitive) */
const SECRET_KEY_PATTERNS = /(?:key|secret|token|password|credential|auth)/i;

/** Known secret value prefixes */
const SECRET_VALUE_PREFIXES = [
  "sk-",
  "pk-",
  "ghp_",
  "gho_",
  "ghs_",
  "xox",
  "ctx7sk-",
  "dapi",
  "AKIA",
  "sk_live_",
  "sk_test_",
  "rk_live_",
  "rk_test_",
  "whsec_",
  "shpat_",
  "shpss_",
  "shppa_",
  "pypi-",
  "npm_",
  "glpat-",
];

/**
 * Heuristic: high-entropy string (≥20 chars, mostly alphanumeric/special).
 * Excludes paths and common non-secret patterns.
 */
function looksHighEntropy(value: string): boolean {
  if (value.length < 20) return false;
  // Skip obvious paths and URLs
  if (value.startsWith("/") || value.startsWith("~") || value.includes("://")) return false;
  // Must be mostly alphanumeric + common secret chars (-, _, .)
  const alphaCount = (value.match(/[A-Za-z0-9\-_./+=]/g) || []).length;
  return alphaCount / value.length > 0.85;
}

/**
 * Returns true if the key/value pair looks like a hardcoded secret.
 */
export function isLikelySecret(key: string, value: string): boolean {
  // Skip ${VAR}, ${env:VAR}, ${VAR:-default} references — already extracted
  if (/^\$\{(env:)?[A-Z_][A-Z0-9_]*(:-[^}]*)?\}$/.test(value)) return false;
  // Skip empty or very short values
  if (!value || value.length < 8) return false;

  // Check key name
  if (SECRET_KEY_PATTERNS.test(key)) return true;

  // Check value prefixes
  for (const prefix of SECRET_VALUE_PREFIXES) {
    if (value.startsWith(prefix)) return true;
  }

  // Check high entropy
  if (looksHighEntropy(value)) return true;

  return false;
}

/**
 * Scan MCP configs for hardcoded secrets in env values.
 */
export function detectSecretsInMcps(
  mcps: Record<string, { env?: Record<string, string> }>
): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const [mcpName, config] of Object.entries(mcps)) {
    if (!config.env) continue;
    for (const [key, value] of Object.entries(config.env)) {
      if (isLikelySecret(key, value)) {
        findings.push({ mcpName, key, value });
      }
    }
  }
  return findings;
}
