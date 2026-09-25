import { motion } from "framer-motion";
import { useReducedMotion } from "../../state/settings";

// Terminal readout (6A.7 W3): dark frame, mono text, lines colored by meaning.

export type TerminalTone = "idle" | "running" | "fail" | "pass";

function lineColor(line: string): string {
  if (/^(--- FAIL|FAIL|FAILED|panic:|E\s|ERROR)/.test(line.trim())) return "text-stamp";
  if (/^(ok\s|PASS|--- PASS|\d+ passed)/.test(line.trim())) return "text-pass";
  if (/^\$ /.test(line)) return "text-amber";
  return "text-paper/80";
}

export function Terminal({
  lines,
  tone = "idle",
  title = "terminal",
  maxHeight = 320,
  shake = false,
}: {
  lines: string[];
  tone?: TerminalTone;
  title?: string;
  maxHeight?: number;
  shake?: boolean;
}) {
  const reduced = useReducedMotion();
  const border = { idle: "border-line", running: "border-amber", fail: "border-stamp", pass: "border-pass" }[
    tone
  ];
  return (
    <motion.div
      className={`overflow-hidden rounded-[2px] border-[3px] ${border} bg-line shadow-hard`}
      animate={shake && !reduced ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-2 border-b-2 border-navy-2 bg-navy px-3 py-1.5">
        <span className="size-2.5 bg-stamp" />
        <span className="size-2.5 bg-amber" />
        <span className="size-2.5 bg-pass" />
        <span className="ml-2 font-mono text-xs text-muted">{title}</span>
      </div>
      <pre
        className="overflow-auto px-4 py-3 font-mono text-[13px] leading-relaxed"
        style={{ maxHeight }}
        aria-live="polite"
      >
        {lines.map((l, i) => (
          <div key={i} className={lineColor(l)}>
            {l || " "}
          </div>
        ))}
      </pre>
    </motion.div>
  );
}
