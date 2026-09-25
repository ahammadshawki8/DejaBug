import "diff2html/bundles/css/diff2html.min.css";
import { html } from "diff2html";
import { useMemo } from "react";

// Unified diff rendered with diff2html, restyled to the game tokens (styles in index.css: .dejabug-diff).

export function DiffView({ diff, empty = "No changes." }: { diff: string; empty?: string }) {
  const markup = useMemo(
    () =>
      diff.trim()
        ? html(diff, {
            drawFileList: false,
            outputFormat: "line-by-line",
            matching: "lines",
            colorScheme: "light" as never,
          })
        : "",
    [diff],
  );
  if (!markup) return <p className="p-4 font-typewriter text-sm text-text-dark/70">{empty}</p>;
  // diff2html escapes the diff content itself; the markup it returns is safe to inject.
  return (
    <div
      className="dejabug-diff max-h-[28rem] overflow-auto text-xs"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
