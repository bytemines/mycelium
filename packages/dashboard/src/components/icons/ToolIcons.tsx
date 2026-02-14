/**
 * Brand SVG icons for AI coding tools.
 * Each icon lives in its own .svg file under ./svg/.
 * Imported via Vite ?raw for inline rendering (preserves gradients, colors).
 */
import claudeSvg from "./svg/claude.svg?raw";
import openaiSvg from "./svg/openai.svg?raw";
import geminiSvg from "./svg/gemini.svg?raw";
import opencodeSvg from "./svg/opencode.svg?raw";
import openclawSvg from "./svg/openclaw.svg?raw";
import cursorSvg from "./svg/cursor.svg?raw";
import vscodeSvg from "./svg/vscode.svg?raw";
import antigravitySvg from "./svg/antigravity.svg?raw";
import githubSvg from "./svg/github.svg?raw";
import mcpSvg from "./svg/mcp.svg?raw";
import { TOOL_REGISTRY } from "@mycelish/core";

interface IconProps {
  size?: number;
}

/** Renders a raw SVG string inline with specified size */
function SvgIcon({ svg, size = 16 }: { svg: string; size?: number }) {
  // Inject width/height into the root <svg> tag
  const sized = svg.replace(
    /<svg\b/,
    `<svg width="${size}" height="${size}"`,
  );
  return <span dangerouslySetInnerHTML={{ __html: sized }} style={{ display: "inline-flex", lineHeight: 0 }} />;
}

export function ClaudeIcon({ size = 16 }: IconProps) {
  return <SvgIcon svg={claudeSvg} size={size} />;
}

export function OpenAIIcon({ size = 16 }: IconProps) {
  return <SvgIcon svg={openaiSvg} size={size} />;
}

export function GeminiIcon({ size = 16 }: IconProps) {
  return <SvgIcon svg={geminiSvg} size={size} />;
}

export function OpenCodeIcon({ size = 16 }: IconProps) {
  return <SvgIcon svg={opencodeSvg} size={size} />;
}

export function OpenClawIcon({ size = 16 }: IconProps) {
  return <SvgIcon svg={openclawSvg} size={size} />;
}

export function CursorIcon({ size = 16 }: IconProps) {
  return <SvgIcon svg={cursorSvg} size={size} />;
}

export function VscodeIcon({ size = 16 }: IconProps) {
  return <SvgIcon svg={vscodeSvg} size={size} />;
}

export function AntigravityIcon({ size = 16 }: IconProps) {
  return <SvgIcon svg={antigravitySvg} size={size} />;
}

const SVG_MAP: Record<string, string> = {
  claude: claudeSvg,
  openai: openaiSvg,
  gemini: geminiSvg,
  opencode: opencodeSvg,
  openclaw: openclawSvg,
  cursor: cursorSvg,
  vscode: vscodeSvg,
  antigravity: antigravitySvg,
};

export const TOOL_ICONS: Record<string, React.ReactNode> = Object.fromEntries(
  Object.values(TOOL_REGISTRY).map(desc => [
    desc.display.name,
    <SvgIcon svg={SVG_MAP[desc.display.icon] ?? ""} />,
  ])
);

export const SOURCE_ICON_MAP: Record<string, string> = {
  "mcp-registry": mcpSvg,
  "anthropic-skills": githubSvg,
  "claude-plugins": claudeSvg,
  "awesome-mcp-servers": githubSvg,
};

export function SourceIcon({ source, size = 14 }: { source: string; size?: number }) {
  const svg = SOURCE_ICON_MAP[source];
  if (!svg) return null;
  return <SvgIcon svg={svg} size={size} />;
}
