import { useState, useRef, useEffect, type ReactNode, type ComponentProps } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { ENTRY_TYPE_META } from "@/lib/entry-type-meta";
import { getTrustTier } from "@/lib/trust";
import { auditMarketplaceEntry, fetchItemContent } from "@/lib/api";
import { Sparkles, Bot, Terminal, Puzzle, Plug, FileText, ShieldCheck, Check, X } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type mermaidType from "mermaid";

import type { MarketplaceItem } from "./SkillCard";

let mermaidInstance: typeof mermaidType | null = null;
let mermaidLoading: Promise<typeof mermaidType> | null = null;

function getMermaid(): Promise<typeof mermaidType> {
  if (mermaidInstance) return Promise.resolve(mermaidInstance);
  if (!mermaidLoading) {
    mermaidLoading = import("mermaid").then(m => {
      mermaidInstance = m.default;
      mermaidInstance.initialize({ startOnLoad: false, theme: "dark", themeVariables: { darkMode: true } });
      return mermaidInstance;
    });
  }
  return mermaidLoading;
}

let mermaidId = 0;

function MermaidBlock({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${++mermaidId}`;
    getMermaid()
      .then(m => m.render(id, chart.trim()))
      .then(({ svg: rendered }) => { if (!cancelled) setSvg(rendered); })
      .catch((err) => { if (!cancelled) setError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, [chart]);

  if (error) {
    return (
      <div className="my-2 rounded-md bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
        <span className="font-medium">Mermaid error:</span> {error}
      </div>
    );
  }
  if (!svg) {
    return (
      <div className="my-2 flex items-center justify-center rounded-md bg-muted/20 py-6">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  return (
    <div
      ref={containerRef}
      className="my-2 overflow-x-auto rounded-md bg-muted/10 p-3 [&_svg]:mx-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

const DEFAULT_TYPE_META = { label: "Item", color: "text-gray-400", bgColor: "bg-gray-500/10", borderColor: "border-gray-500/30", fileExt: ".md" };

function getTypeIcon(type: string, size: number): ReactNode {
  switch (type) {
    case "skill": return <Sparkles size={size} />;
    case "mcp": return <Plug size={size} />;
    case "plugin": return <Puzzle size={size} />;
    case "agent": return <Bot size={size} />;
    case "command": return <Terminal size={size} />;
    default: return <FileText size={size} />;
  }
}

function getTypeMeta(type: string) {
  return ENTRY_TYPE_META[type] || DEFAULT_TYPE_META;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * Strip YAML frontmatter (--- delimited) from SKILL.md / AGENT.md / README.md content.
 * Also handles bare `key: value` headers without --- delimiters as a fallback.
 */
function stripFrontmatter(raw: string): string {
  // Standard YAML frontmatter: --- ... ---
  const yamlFm = /^---\s*\n[\s\S]*?\n---\s*\n?/;
  if (yamlFm.test(raw)) {
    return raw.replace(yamlFm, "").trimStart();
  }

  // Fallback: bare key: value lines at the top (name:, description:, tools:, etc.)
  const lines = raw.split("\n");
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const fmKey = /^(name|description|tools|model|color|license|allowed-tools)\s*:/i;
  while (i < lines.length && fmKey.test(lines[i].trim())) i++;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i > 0) return lines.slice(i).join("\n");
  return raw;
}

export function SkillDetailPanel({
  item,
  open,
  onOpenChange,
  onInstall,
  onUpdate,
  onRemove,
}: {
  item: MarketplaceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (item: MarketplaceItem) => void;
  onUpdate: (item: MarketplaceItem) => void;
  onRemove: (item: MarketplaceItem) => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [auditResult, setAuditResult] = useState<{ safe: boolean; findings: Array<{ ruleId: string; severity: string; message: string; match: string }> } | null>(null);
  const [auditing, setAuditing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || !item) {
      setContent(null);
      setAuditResult(null);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingContent(true);
    fetchItemContent(item.url ?? "", item.type, controller.signal, item.name)
      .then(c => { if (!controller.signal.aborted) setContent(c ?? ""); })
      .finally(() => { if (!controller.signal.aborted) setLoadingContent(false); });
    return () => { controller.abort(); };
  }, [open, item]);

  if (!item) return null;

  const meta = getTypeMeta(item.type);
  const trust = getTrustTier(item.source);
  const hasUpdate = item.installed && item.latestVersion && item.installedVersion && item.latestVersion !== item.installedVersion;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-start gap-3 border-b border-border/50 px-6 py-4">
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", meta.bgColor, meta.color)}>
              {getTypeIcon(item.type, 20)}
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="flex items-center gap-2 text-lg font-semibold text-foreground">
                {item.name}
                <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider opacity-70", meta.bgColor, meta.color)}>
                  {meta.label}
                </span>
                {trust.tier !== "community" && (
                  <span title={`Verified: ${trust.tier} source`}>
                    <Check size={14} className="text-white opacity-60" strokeWidth={3} />
                  </span>
                )}
              </Dialog.Title>
              <Dialog.Description className="flex items-center gap-3 text-xs text-muted-foreground">
                {item.source && <span className="font-medium">{item.source}</span>}
                {item.author && <span>{item.author}</span>}
                {item.stars != null && (
                  <span className="flex items-center gap-0.5">
                    <span className="text-yellow-400">&#9733;</span>
                    {formatCount(item.stars)}
                  </span>
                )}
                {item.downloads != null && item.downloads > 0 && (
                  <span className="flex items-center gap-0.5" title="Weekly npm downloads">
                    <span className="text-green-400">&#8615;</span>
                    {formatCount(item.downloads)}
                  </span>
                )}
                {item.latestVersion && <span className="font-mono">v{item.latestVersion}</span>}
                {item.url && (
                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                    className="hover:text-primary">Source &#8599;</a>
                )}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loadingContent && (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
            {content != null && !loadingContent && (
              <div className="max-w-none text-sm leading-relaxed text-foreground/90 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_li]:my-0.5 [&_p]:my-2 [&_a]:text-primary [&_a]:no-underline hover:[&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:my-2 [&_table]:w-full [&_table]:my-2 [&_th]:border [&_th]:border-border/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:bg-muted/30 [&_th]:font-medium [&_td]:border [&_td]:border-border/50 [&_td]:px-2 [&_td]:py-1 [&_hr]:border-border/30 [&_hr]:my-3 [&_strong]:font-semibold [&_strong]:text-foreground">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code(props: ComponentProps<"code">) {
                      const { children, className, ...rest } = props;
                      const match = /language-(\w+)/.exec(className || "");
                      const lang = match?.[1];
                      const inline = !match && !String(children).includes("\n");
                      if (inline) {
                        return <code className="rounded bg-muted/60 px-1.5 py-0.5 text-xs font-mono text-foreground/90" {...rest}>{children}</code>;
                      }
                      if (lang === "mermaid") {
                        return <MermaidBlock chart={String(children)} />;
                      }
                      return (
                        <SyntaxHighlighter
                          style={oneDark}
                          language={lang || "text"}
                          PreTag="div"
                          wrapLines={false}
                          wrapLongLines={false}
                          customStyle={{ margin: 0, padding: "0.75rem 1rem", borderRadius: "0.375rem", fontSize: "0.75rem", lineHeight: "1.5", background: "rgba(0,0,0,0.3)", border: "none" }}
                          codeTagProps={{ style: { background: "none", border: "none", padding: 0 } }}
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      );
                    },
                    pre({ children }) {
                      return <div className="my-2 overflow-x-auto rounded-md">{children}</div>;
                    },
                  }}
                >{stripFrontmatter(content)}</Markdown>
              </div>
            )}
            {!content && !loadingContent && (
              <p className="text-sm text-muted-foreground">{item.description}</p>
            )}

            {/* Audit results */}
            {auditResult && (
              <div className="mt-4 space-y-1.5 border-t border-border/50 pt-3">
                {auditResult.safe ? (
                  <span className="text-xs text-green-400 font-medium">{"\u2713"} No security issues found</span>
                ) : (
                  <>
                    <span className="text-xs font-medium text-muted-foreground">{auditResult.findings.length} finding(s):</span>
                    {auditResult.findings.slice(0, 5).map((f, i) => (
                      <div key={i} className={cn("rounded px-2 py-1 text-[11px]",
                        f.severity === "critical" ? "bg-red-500/15 text-red-400" :
                        f.severity === "high" ? "bg-orange-500/15 text-orange-400" :
                        f.severity === "medium" ? "bg-yellow-500/15 text-yellow-400" :
                        "bg-blue-500/15 text-blue-400"
                      )}>
                        <span className="font-medium">[{f.severity}]</span> {f.message}
                      </div>
                    ))}
                    {auditResult.findings.length > 5 && (
                      <span className="text-[11px] text-muted-foreground">...and {auditResult.findings.length - 5} more</span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Action bar */}
          <div className="flex items-center justify-end gap-2 border-t border-border/50 px-6 py-3">
            <button
              onClick={async () => {
                setAuditing(true);
                try {
                  const result = await auditMarketplaceEntry(item.name, item.source, item.type);
                  setAuditResult(result);
                } catch { setAuditResult(null); }
                finally { setAuditing(false); }
              }}
              disabled={auditing}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border border-border hover:bg-muted disabled:opacity-50 transition-colors"
              title="Scan for security issues"
            >
              <ShieldCheck size={14} />
              {auditing ? "Scanning..." : "Audit"}
            </button>
            {item.installed && (
              <button
                onClick={() => onRemove(item)}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/15 transition-colors"
                title="Uninstall and remove from all tools"
              >
                Remove
              </button>
            )}
            {hasUpdate && (
              <button
                onClick={() => onUpdate(item)}
                className="rounded-md px-3 py-1.5 text-xs font-medium bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-colors"
                title={`Update to latest version${item.latestVersion ? ` (v${item.latestVersion})` : ""}`}
              >
                Update
              </button>
            )}
            <button
              onClick={() => onInstall(item)}
              disabled={item.installed}
              title={item.installed ? "Already installed" : `Install this ${item.type}`}
              className={cn(
                "rounded-md px-4 py-1.5 text-xs font-medium transition-colors",
                item.installed
                  ? "border border-green-500/30 text-green-400 bg-green-500/10"
                  : item.type === "plugin"
                    ? "bg-amber-500/80 text-white hover:bg-amber-500"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-50"
              )}
            >
              {item.installed ? "Installed" : item.type === "plugin" ? "Install Plugin" : "Install"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
