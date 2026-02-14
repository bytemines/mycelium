/**
 * content-hash — shared content hashing utility
 *
 * Extracted to avoid circular imports between marketplace.ts and marketplace-sources.ts.
 */
import * as crypto from "node:crypto";

/** Compute a 12-character SHA-256 hex prefix for version tracking. */
export function computeContentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 12);
}
