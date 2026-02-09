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
import aiderSvg from "./svg/aider.svg?raw";

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

export function AiderIcon({ size = 16 }: IconProps) {
  return <SvgIcon svg={aiderSvg} size={size} />;
}

export const TOOL_ICONS: Record<string, React.ReactNode> = {
  "Claude Code": <ClaudeIcon />,
  "Codex CLI": <OpenAIIcon />,
  "Gemini CLI": <GeminiIcon />,
  "OpenCode": <OpenCodeIcon />,
  "OpenClaw": <OpenClawIcon />,
  "Aider": <AiderIcon />,
};
