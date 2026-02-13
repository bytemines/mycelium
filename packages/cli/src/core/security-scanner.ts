/**
 * Security scanner for AI agent skills and MCP configs.
 * Detection rules adapted from Cisco AI Defense skill-scanner (Apache 2.0)
 * https://github.com/cisco-ai-defense/skill-scanner
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface SecurityFinding {
  ruleId: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  file?: string;
  line?: number;
  match: string;
  remediation: string;
}

export interface ScanResult {
  safe: boolean;
  findings: SecurityFinding[];
  scannedFiles: number;
  duration: number;
}

interface Rule {
  id: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  pattern: RegExp;
  message: string;
  remediation: string;
}

const RULES: Rule[] = [
  // ── Prompt Injection (PI) ──
  { id: "PI-001", category: "prompt-injection", severity: "critical", pattern: /ignore\s+(all\s+)?previous\s+instructions/gi, message: "Prompt injection: ignore previous instructions", remediation: "Remove prompt injection payload" },
  { id: "PI-002", category: "prompt-injection", severity: "critical", pattern: /you\s+are\s+now\s+a/gi, message: "Prompt injection: role reassignment", remediation: "Remove role reassignment attempt" },
  { id: "PI-003", category: "prompt-injection", severity: "high", pattern: /system\s*:\s*you\s+are/gi, message: "Prompt injection: fake system prompt", remediation: "Remove fake system prompt" },
  { id: "PI-004", category: "prompt-injection", severity: "critical", pattern: /disregard\s+(all\s+)?prior/gi, message: "Prompt injection: disregard prior instructions", remediation: "Remove prompt injection payload" },

  // ── Command Injection (CI) ──
  { id: "CI-001", category: "command-injection", severity: "high", pattern: /\beval\s*\(/gi, message: "Potential command injection via eval()", remediation: "Avoid eval(); use safer alternatives" },
  { id: "CI-002", category: "command-injection", severity: "high", pattern: /\bexec\s*\(/gi, message: "Potential command injection via exec()", remediation: "Validate and sanitize inputs to exec()" },
  { id: "CI-003", category: "command-injection", severity: "high", pattern: /os\.system\s*\(/gi, message: "OS command execution via os.system()", remediation: "Use subprocess with argument lists instead" },
  { id: "CI-004", category: "command-injection", severity: "high", pattern: /subprocess\.(call|run|Popen)/gi, message: "Subprocess execution detected", remediation: "Ensure inputs are validated; avoid shell=True" },
  { id: "CI-005", category: "command-injection", severity: "medium", pattern: /child_process/gi, message: "Node.js child_process usage", remediation: "Validate all inputs passed to child_process" },
  { id: "CI-006", category: "command-injection", severity: "high", pattern: /\$\([^)]+\)/g, message: "Shell command substitution detected", remediation: "Avoid command substitution with untrusted input" },

  // ── Data Exfiltration (DE) ──
  { id: "DE-001", category: "data-exfiltration", severity: "high", pattern: /fetch\s*\(\s*['"]https?:\/\//gi, message: "Outbound fetch to external URL", remediation: "Verify the URL is trusted and necessary" },
  { id: "DE-002", category: "data-exfiltration", severity: "high", pattern: /new\s+XMLHttpRequest/gi, message: "XMLHttpRequest creation detected", remediation: "Verify the request target is trusted" },
  { id: "DE-003", category: "data-exfiltration", severity: "high", pattern: /\.sendBeacon\(/gi, message: "sendBeacon used for data transmission", remediation: "Verify beacon target is trusted" },
  { id: "DE-004", category: "data-exfiltration", severity: "critical", pattern: /btoa\s*\(.*\bpassword\b/gi, message: "Password encoding for potential exfiltration", remediation: "Remove password encoding logic" },

  // ── Obfuscation (OB) ──
  { id: "OB-001", category: "obfuscation", severity: "medium", pattern: /[A-Za-z0-9+/=]{100,}/g, message: "Large base64-like string detected", remediation: "Decode and inspect the content" },
  { id: "OB-002", category: "obfuscation", severity: "high", pattern: /\\x[0-9a-f]{2}(\\x[0-9a-f]{2}){10,}/gi, message: "Hex-encoded string sequence", remediation: "Decode and inspect the hex content" },
  { id: "OB-003", category: "obfuscation", severity: "high", pattern: /String\.fromCharCode\s*\(/gi, message: "Dynamic string construction from char codes", remediation: "Replace with literal strings" },
  { id: "OB-004", category: "obfuscation", severity: "high", pattern: /atob\s*\(/gi, message: "Base64 decoding detected", remediation: "Inspect what is being decoded" },

  // ── Hardcoded Secrets (HS) ──
  { id: "HS-001", category: "hardcoded-secrets", severity: "critical", pattern: /AKIA[0-9A-Z]{16}/g, message: "AWS access key detected", remediation: "Remove the key and rotate credentials" },
  { id: "HS-002", category: "hardcoded-secrets", severity: "critical", pattern: /(?:api[_-]?key|api[_-]?secret|token)\s*[:=]\s*['"][A-Za-z0-9]{20,}/gi, message: "Hardcoded API key or token", remediation: "Use environment variables for secrets" },
  { id: "HS-003", category: "hardcoded-secrets", severity: "critical", pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g, message: "Private key embedded in content", remediation: "Remove private key; use secure key management" },
  { id: "HS-004", category: "hardcoded-secrets", severity: "critical", pattern: /(?:mysql|postgres|mongodb):\/\/[^:]+:[^@]+@/gi, message: "Database connection string with credentials", remediation: "Use environment variables for connection strings" },

  // ── Social Engineering (SE) ──
  { id: "SE-001", category: "social-engineering", severity: "high", pattern: /run\s+this\s+(command|script)\s+first/gi, message: "Social engineering: urgency to run commands", remediation: "Review the command before executing" },
  { id: "SE-002", category: "social-engineering", severity: "critical", pattern: /you\s+must\s+disable\s+(your\s+)?(antivirus|firewall)/gi, message: "Social engineering: disable security", remediation: "Never disable security software" },
  { id: "SE-003", category: "social-engineering", severity: "high", pattern: /grant\s+(full|admin)\s+access/gi, message: "Social engineering: privilege escalation request", remediation: "Review access requirements carefully" },
  { id: "SE-004", category: "social-engineering", severity: "medium", pattern: /don'?t\s+worry\s+about\s+security/gi, message: "Social engineering: dismiss security concerns", remediation: "Always consider security implications" },

  // ── Resource Abuse (RA) ──
  { id: "RA-001", category: "resource-abuse", severity: "critical", pattern: /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}/g, message: "Fork bomb detected", remediation: "Remove the fork bomb" },
  { id: "RA-002", category: "resource-abuse", severity: "medium", pattern: /while\s*\(\s*true\s*\)/gi, message: "Infinite loop detected", remediation: "Add a termination condition" },
  { id: "RA-003", category: "resource-abuse", severity: "medium", pattern: /for\s*\(\s*;\s*;\s*\)/g, message: "Infinite for-loop detected", remediation: "Add a termination condition" },
  { id: "RA-004", category: "resource-abuse", severity: "high", pattern: /setInterval\s*\(.*,\s*[01]\s*\)/g, message: "Extremely rapid interval detected", remediation: "Use a reasonable interval value" },

  // ── Persistence (PE) ──
  { id: "PE-001", category: "persistence", severity: "high", pattern: /crontab/gi, message: "Cron job manipulation detected", remediation: "Verify the cron job is necessary and safe" },
  { id: "PE-002", category: "persistence", severity: "high", pattern: /launchctl\s+load/gi, message: "macOS launch agent/daemon loading", remediation: "Verify the launch agent is trusted" },
  { id: "PE-003", category: "persistence", severity: "critical", pattern: /curl\s.*\|\s*(?:bash|sh|zsh)/gi, message: "Remote script download and execution", remediation: "Download and inspect scripts before executing" },
  { id: "PE-004", category: "persistence", severity: "critical", pattern: /wget\s.*\|\s*(?:bash|sh|zsh)/gi, message: "Remote script download and execution via wget", remediation: "Download and inspect scripts before executing" },
  { id: "PE-005", category: "persistence", severity: "high", pattern: /systemctl\s+enable/gi, message: "Systemd service auto-start", remediation: "Verify the service is trusted" },

  // ── Reverse Shells (RS) ──
  { id: "RS-001", category: "reverse-shell", severity: "critical", pattern: /\/dev\/tcp\//gi, message: "Bash TCP device for reverse shell", remediation: "Remove the reverse shell payload" },
  { id: "RS-002", category: "reverse-shell", severity: "critical", pattern: /nc\s+-[elp]/gi, message: "Netcat listener/reverse shell", remediation: "Remove the netcat reverse shell" },
  { id: "RS-003", category: "reverse-shell", severity: "critical", pattern: /bash\s+-i\s+>&\s*\/dev\/tcp/gi, message: "Interactive bash reverse shell", remediation: "Remove the reverse shell payload" },
  { id: "RS-004", category: "reverse-shell", severity: "critical", pattern: /python.*socket.*connect/gi, message: "Python socket connection (potential reverse shell)", remediation: "Verify the socket connection purpose" },
  { id: "RS-005", category: "reverse-shell", severity: "high", pattern: /mkfifo/gi, message: "Named pipe creation (potential reverse shell component)", remediation: "Verify the named pipe usage" },

  // ── Suspicious URLs (SU) ──
  { id: "SU-001", category: "suspicious-urls", severity: "medium", pattern: /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, message: "URL with raw IP address", remediation: "Use domain names instead of IP addresses" },
  { id: "SU-002", category: "suspicious-urls", severity: "medium", pattern: /bit\.ly\//gi, message: "URL shortener (bit.ly) detected", remediation: "Use full URLs for transparency" },
  { id: "SU-003", category: "suspicious-urls", severity: "medium", pattern: /tinyurl\.com\//gi, message: "URL shortener (tinyurl) detected", remediation: "Use full URLs for transparency" },
  { id: "SU-004", category: "suspicious-urls", severity: "high", pattern: /pastebin\.com\/raw/gi, message: "Raw pastebin content URL", remediation: "Host content on trusted infrastructure" },

  // ── Credential Harvesting (CH) ──
  { id: "CH-001", category: "credential-harvesting", severity: "high", pattern: /~\/\.ssh\//gi, message: "SSH directory access", remediation: "Verify SSH key access is necessary" },
  { id: "CH-002", category: "credential-harvesting", severity: "high", pattern: /~\/\.aws\//gi, message: "AWS credentials directory access", remediation: "Use IAM roles instead of credential files" },
  { id: "CH-003", category: "credential-harvesting", severity: "high", pattern: /~\/\.gnupg\//gi, message: "GPG keyring access", remediation: "Verify GPG key access is necessary" },
  { id: "CH-004", category: "credential-harvesting", severity: "high", pattern: /wallet\.dat/gi, message: "Cryptocurrency wallet file access", remediation: "Remove wallet file references" },
  { id: "CH-005", category: "credential-harvesting", severity: "high", pattern: /security\s+keychain|keychain-db|dump[_-]keychain/gi, message: "Keychain access detected", remediation: "Verify keychain access is necessary" },

  // ── Path Traversal (PT) ──
  { id: "PT-001", category: "path-traversal", severity: "high", pattern: /\.\.\/\.\.\//g, message: "Path traversal attempt", remediation: "Use absolute paths; validate path inputs" },
  { id: "PT-002", category: "path-traversal", severity: "critical", pattern: /\/etc\/passwd/g, message: "Access to /etc/passwd", remediation: "Remove sensitive file access" },
  { id: "PT-003", category: "path-traversal", severity: "critical", pattern: /\/etc\/shadow/g, message: "Access to /etc/shadow", remediation: "Remove sensitive file access" },
  { id: "PT-004", category: "path-traversal", severity: "high", pattern: /%2e%2e%2f/gi, message: "URL-encoded path traversal", remediation: "Decode and validate path inputs" },

  // ── Deserialization (DS) ──
  { id: "DS-001", category: "deserialization", severity: "critical", pattern: /pickle\.loads?\(/gi, message: "Unsafe pickle deserialization", remediation: "Use JSON or other safe serialization formats" },
  { id: "DS-002", category: "deserialization", severity: "critical", pattern: /yaml\.load\s*\((?!.*Loader)/g, message: "Unsafe YAML load without safe Loader", remediation: "Use yaml.safe_load() or specify SafeLoader" },
  { id: "DS-003", category: "deserialization", severity: "high", pattern: /marshal\.loads?\(/gi, message: "Unsafe marshal deserialization", remediation: "Use JSON or other safe serialization" },
  { id: "DS-004", category: "deserialization", severity: "high", pattern: /unserialize\s*\(/gi, message: "PHP unserialize detected", remediation: "Use JSON decode instead" },

  // ── SSRF (SS) ──
  { id: "SS-001", category: "ssrf", severity: "critical", pattern: /169\.254\.169\.254/g, message: "AWS metadata endpoint (SSRF target)", remediation: "Block access to cloud metadata endpoints" },
  { id: "SS-002", category: "ssrf", severity: "low", pattern: /localhost:\d{4,5}/g, message: "Localhost with port (potential SSRF)", remediation: "Validate and restrict internal URL access" },
  { id: "SS-003", category: "ssrf", severity: "low", pattern: /127\.0\.0\.1:\d{4,5}/g, message: "Loopback address with port", remediation: "Validate and restrict internal URL access" },
  { id: "SS-004", category: "ssrf", severity: "low", pattern: /0\.0\.0\.0:\d{4,5}/g, message: "Wildcard address with port", remediation: "Bind to specific interfaces" },

  // ── Cryptomining (CM) ──
  { id: "CM-001", category: "cryptomining", severity: "critical", pattern: /xmrig/gi, message: "XMRig cryptominer reference", remediation: "Remove cryptomining software" },
  { id: "CM-002", category: "cryptomining", severity: "critical", pattern: /stratum\+tcp:\/\//gi, message: "Stratum mining protocol URL", remediation: "Remove mining pool connection" },
  { id: "CM-003", category: "cryptomining", severity: "critical", pattern: /stratum:\/\//gi, message: "Stratum mining protocol", remediation: "Remove mining pool connection" },
  { id: "CM-004", category: "cryptomining", severity: "high", pattern: /coinhive/gi, message: "CoinHive reference detected", remediation: "Remove browser-based mining code" },

  // ── Prototype Pollution (PP) ──
  { id: "PP-001", category: "prototype-pollution", severity: "high", pattern: /__proto__/g, message: "Prototype pollution via __proto__", remediation: "Use Object.create(null) or Map" },
  { id: "PP-002", category: "prototype-pollution", severity: "high", pattern: /constructor\s*\[\s*['"]prototype/gi, message: "Prototype access via constructor", remediation: "Validate object keys; reject prototype keys" },
  { id: "PP-003", category: "prototype-pollution", severity: "high", pattern: /Object\.assign\s*\(\s*\{?\}?.*__proto__/gi, message: "Object.assign with prototype pollution", remediation: "Filter __proto__ from input objects" },
  { id: "PP-004", category: "prototype-pollution", severity: "medium", pattern: /\["__proto__"\]/g, message: "Bracket notation __proto__ access", remediation: "Sanitize property names" },

  // ── Unsafe Regex (UR) ──
  { id: "UR-001", category: "unsafe-regex", severity: "medium", pattern: /\([^)]*[+*][^)]*\)[+*]/g, message: "Potential ReDoS pattern (nested quantifiers)", remediation: "Simplify the regex to avoid catastrophic backtracking" },
  { id: "UR-002", category: "unsafe-regex", severity: "medium", pattern: /(\.\*){3,}/g, message: "Excessive wildcards in regex", remediation: "Use more specific patterns" },
  { id: "UR-003", category: "unsafe-regex", severity: "medium", pattern: /new\s+RegExp\s*\([^)]*\+/gi, message: "Dynamic regex from user input", remediation: "Escape user input before RegExp construction" },
  { id: "UR-004", category: "unsafe-regex", severity: "low", pattern: /\(\?:[^)]{50,}\)/g, message: "Overly complex regex group", remediation: "Simplify the regex pattern" },

  // ── Insecure Network (IN) ──
  { id: "IN-001", category: "insecure-network", severity: "high", pattern: /rejectUnauthorized\s*:\s*false/gi, message: "TLS verification disabled", remediation: "Enable TLS certificate verification" },
  { id: "IN-002", category: "insecure-network", severity: "high", pattern: /NODE_TLS_REJECT_UNAUTHORIZED.*0/gi, message: "Node.js TLS verification disabled via env", remediation: "Remove NODE_TLS_REJECT_UNAUTHORIZED=0" },
  { id: "IN-003", category: "insecure-network", severity: "medium", pattern: /Access-Control-Allow-Origin.*\*/gi, message: "Wildcard CORS policy", remediation: "Restrict CORS to specific origins" },
  { id: "IN-004", category: "insecure-network", severity: "high", pattern: /verify\s*=\s*False/g, message: "Python SSL verification disabled", remediation: "Enable SSL verification" },

  // ── Capability Inflation (CA) ──
  { id: "CA-001", category: "capability-inflation", severity: "medium", pattern: /completely\s+safe/gi, message: "Misleading safety claim", remediation: "Remove absolute safety claims" },
  { id: "CA-002", category: "capability-inflation", severity: "medium", pattern: /no\s+security\s+risk/gi, message: "Misleading risk dismissal", remediation: "Acknowledge security considerations" },
  { id: "CA-003", category: "capability-inflation", severity: "low", pattern: /trust(ed)?\s+by\s+millions/gi, message: "Unverifiable trust claim", remediation: "Provide verifiable trust evidence" },
  { id: "CA-004", category: "capability-inflation", severity: "low", pattern: /100%\s+secure/gi, message: "Absolute security claim", remediation: "No system is 100% secure; be accurate" },

  // ── Extension Threats (ET) ──
  { id: "ET-001", category: "extension-threats", severity: "medium", pattern: /telemetry\.send|enableTelemetry|telemetry[_-]endpoint|sendTelemetry/gi, message: "Telemetry tracking detected", remediation: "Ensure telemetry is opt-in and disclosed" },
  { id: "ET-002", category: "extension-threats", severity: "high", pattern: /tracking[_-]?pixel/gi, message: "Tracking pixel detected", remediation: "Remove tracking pixels" },
  { id: "ET-003", category: "extension-threats", severity: "medium", pattern: /analytics\.track/gi, message: "Analytics tracking call", remediation: "Ensure analytics is disclosed and opt-in" },
  { id: "ET-004", category: "extension-threats", severity: "medium", pattern: /beacon\s*\(/gi, message: "Beacon API usage for tracking", remediation: "Verify beacon usage is disclosed" },
];

export function scanContent(content: string, fileName: string): ScanResult {
  const start = Date.now();
  const findings: SecurityFinding[] = [];
  const lines = content.split("\n");

  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i++) {
      // Reset lastIndex for global regexes
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(lines[i]);
      if (match) {
        findings.push({
          ruleId: rule.id,
          category: rule.category,
          severity: rule.severity,
          message: rule.message,
          file: fileName,
          line: i + 1,
          match: match[0].slice(0, 100),
          remediation: rule.remediation,
        });
      }
    }
  }

  return {
    safe: findings.length === 0,
    findings,
    scannedFiles: 1,
    duration: Date.now() - start,
  };
}

async function readDirRecursive(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readDirRecursive(fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

export async function scanSkill(skillPath: string): Promise<ScanResult> {
  const start = Date.now();
  const allFindings: SecurityFinding[] = [];
  const files = await readDirRecursive(skillPath);
  let scannedFiles = 0;

  for (const file of files) {
    try {
      const content = await readFile(file, "utf-8");
      const result = scanContent(content, file);
      allFindings.push(...result.findings);
      scannedFiles++;
    } catch {
      // Skip unreadable files (binary, permissions, etc.)
    }
  }

  return {
    safe: allFindings.length === 0,
    findings: allFindings,
    scannedFiles,
    duration: Date.now() - start,
  };
}
