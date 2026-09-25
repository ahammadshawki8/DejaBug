import type { ButtonHTMLAttributes, ReactNode } from "react";

// Chunky arcade button (6A.3/6A.8): 3px outline, hard shadow, presses 2px on click.

type Tone = "amber" | "stamp" | "paper" | "navy";
type Size = "sm" | "md" | "lg" | "xl";

const TONES: Record<Tone, string> = {
  amber: "bg-amber text-line",
  stamp: "bg-stamp text-paper",
  paper: "bg-paper text-text-dark",
  navy: "bg-navy-2 text-paper",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-6 py-3 text-base gap-2.5",
  xl: "px-8 py-5 text-xl gap-3",
};

export interface ArcadeButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  size?: Size;
  icon?: ReactNode;
  shortcut?: string;
}

export function ArcadeButton({
  tone = "amber",
  size = "md",
  icon,
  shortcut,
  className = "",
  children,
  ...rest
}: ArcadeButtonProps) {
  return (
    <button
      type="button"
      className={[
        "inline-flex select-none items-center justify-center border-[3px] border-line font-display uppercase",
        "rounded-[2px] shadow-hard transition-[transform,box-shadow] duration-100",
        "hover:brightness-105 active:translate-x-[2px] active:translate-y-[2px] active:shadow-hard-sm",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-none disabled:active:shadow-hard",
        TONES[tone],
        SIZES[size],
        className,
      ].join(" ")}
      {...rest}
    >
      {icon ? <span className="flex shrink-0 items-center [&>svg]:size-[1.25em]">{icon}</span> : null}
      <span>{children}</span>
      {shortcut ? (
        <kbd className="ml-1 border-2 border-current px-1 font-mono text-[0.7em] leading-tight opacity-70">
          {shortcut}
        </kbd>
      ) : null}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={[
        "inline-flex size-9 items-center justify-center rounded-[2px] border-2 border-line bg-navy-2 text-paper",
        "shadow-hard-sm transition-transform hover:text-amber active:translate-x-px active:translate-y-px [&>svg]:size-5",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
