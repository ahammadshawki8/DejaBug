import type { HTMLAttributes, ReactNode } from "react";
import { CorkPin, PaperClip } from "../../art/sprites";

// Surfaces (6A.2): paper and manila documents, dark navy panels. Strong borders, hard shadows.

type PaperTone = "paper" | "manila";

export interface PaperPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: PaperTone;
  pinned?: boolean;
  clipped?: boolean;
  title?: ReactNode;
}

export function PaperPanel({
  tone = "paper",
  pinned,
  clipped,
  title,
  className = "",
  children,
  ...rest
}: PaperPanelProps) {
  return (
    <div
      className={[
        "paper-grain relative rounded-[2px] border-[3px] border-line text-text-dark shadow-hard",
        tone === "paper" ? "bg-paper" : "bg-manila",
        className,
      ].join(" ")}
      {...rest}
    >
      {pinned ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2">
          <CorkPin />
        </span>
      ) : null}
      {clipped ? (
        <span className="absolute -top-4 right-6">
          <PaperClip />
        </span>
      ) : null}
      {title ? (
        <div className="border-b-[3px] border-line px-4 py-2 font-display text-sm uppercase tracking-wide">
          {title}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function DarkPanel({
  title,
  className = "",
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & { title?: ReactNode }) {
  return (
    <div
      className={["rounded-[2px] border-[3px] border-line bg-navy text-paper shadow-hard", className].join(
        " ",
      )}
      {...rest}
    >
      {title ? (
        <div className="border-b-[3px] border-line bg-navy-2 px-4 py-2 font-display text-sm uppercase tracking-wide">
          {title}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** Chunky stat tile (6A.1): colored block, big number, small label. */
export function StatTile({
  label,
  value,
  tone = "navy",
  icon,
}: {
  label: string;
  value: ReactNode;
  tone?: "navy" | "amber" | "stamp" | "manila";
  icon?: ReactNode;
}) {
  const tones = {
    navy: "bg-navy-2 text-paper",
    amber: "bg-amber text-line",
    stamp: "bg-stamp text-paper",
    manila: "bg-manila text-text-dark",
  };
  return (
    <div
      className={`flex items-center gap-3 rounded-[2px] border-[3px] border-line px-4 py-3 shadow-hard ${tones[tone]}`}
    >
      <div className="min-w-0 flex-1">
        <div className="font-display text-[11px] uppercase tracking-wider opacity-80">{label}</div>
        <div className="tabular truncate font-display text-2xl leading-tight">{value}</div>
      </div>
      {icon ? <div className="shrink-0 [&>svg]:size-7">{icon}</div> : null}
    </div>
  );
}
