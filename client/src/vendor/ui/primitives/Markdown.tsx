import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';

const inlineCode: React.CSSProperties = {
  fontSize: "0.92em",
  padding: "1px 6px",
  borderRadius: 4,
  background: "var(--bg-hover)",
  color: "var(--accent-text)",
};

const cell: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid var(--border)",
  textAlign: "left",
  verticalAlign: "top",
  overflowWrap: "normal",
  wordBreak: "normal",
};

/**
 * Markdown renderer (replaces prototype mdLite). Inline + GFM.
 * `variant="document"` renders full documents (specs, READMEs): sized headings and muted body text.
 */
export function Markdown({
  children,
  variant = "inline",
}: {
  children?: string | null;
  variant?: "inline" | "document";
}) {
  if (!children) return null;
  const doc = variant === "document";
  const heading = (size: number, top: number): React.CSSProperties => ({
    fontSize: size,
    fontWeight: 650,
    lineHeight: 1.3,
    color: "var(--text-primary)",
    margin: `${top}px 0 10px`,
  });
  const headings = doc
    ? {
        h1: ({ children }: { children?: React.ReactNode }) => <h1 style={heading(24, 0)}>{children}</h1>,
        h2: ({ children }: { children?: React.ReactNode }) => <h2 style={heading(18, 26)}>{children}</h2>,
        h3: ({ children }: { children?: React.ReactNode }) => <h3 style={heading(15.5, 20)}>{children}</h3>,
        h4: ({ children }: { children?: React.ReactNode }) => <h4 style={heading(14, 16)}>{children}</h4>,
      }
    : {};
  return (
    <div
      className="dd-md"
      style={{ fontSize: "inherit", lineHeight: doc ? 1.65 : 1.55, color: doc ? "var(--text-secondary)" : undefined }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          ...headings,
          p: ({ children }) => <p style={{ margin: doc ? "0 0 12px" : "0 0 10px" }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          ul: ({ children }) => <ul style={{ margin: "0 0 12px", paddingLeft: 22 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: "0 0 12px", paddingLeft: 22 }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: "3px 0" }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote
              style={{ margin: "0 0 12px", padding: "2px 12px", borderLeft: "3px solid var(--border-strong)" }}
            >
              {children}
            </blockquote>
          ),
          pre: ({ children }) => (
            <pre
              style={{
                margin: "0 0 14px",
                padding: "12px 14px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--code-bg, var(--bg-primary))",
                overflowX: "auto",
                fontFamily: MONO,
                fontSize: 12.5,
                lineHeight: 1.6,
                color: "var(--text-primary)",
              }}
            >
              {children}
            </pre>
          ),
          code: ({ children, className }) => {
            // Fenced blocks carry a language class or span lines; they are styled by `pre`.
            const block = /language-/.test(className ?? "") || String(children).includes("\n");
            if (block) return <code className="mono">{children}</code>;
            return (
              <code className="mono" style={inlineCode}>
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "0 0 14px" }}>
              <table style={{ borderCollapse: "collapse", minWidth: "100%", fontSize: "0.95em" }}>{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th style={{ ...cell, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{children}</th>
          ),
          td: ({ children }) => <td style={{ ...cell, minWidth: 80 }}>{children}</td>,
          hr: () => <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "18px 0" }} />,
          a: ({ children, href }) => (
            <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
