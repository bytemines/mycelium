export type TrustTier = "official" | "verified" | "community";

export interface TrustInfo {
  tier: TrustTier;
  label: string;
  color: string;
  bgColor: string;
}

export function getTrustTier(source: string): TrustInfo {
  switch (source) {
    case "anthropic-skills":
      return { tier: "official", label: "Official", color: "text-green-400", bgColor: "bg-green-500/15" };
    case "mcp-registry":
    case "claude-plugins":
      return { tier: "verified", label: "Verified", color: "text-blue-400", bgColor: "bg-blue-500/15" };
    default:
      return { tier: "community", label: "Community", color: "text-gray-400", bgColor: "bg-gray-500/15" };
  }
}
