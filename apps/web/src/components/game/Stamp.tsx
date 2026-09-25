import { motion } from "framer-motion";
import { useReducedMotion } from "../../state/settings";

// Rubber stamp (6A.7, 6A.8): double-ruled border, slight tilt, slams in with weight.

export function Stamp({
  children,
  tone = "stamp",
  size = "md",
  slam = false,
  rotate = -8,
  className = "",
}: {
  children: string;
  tone?: "stamp" | "pass" | "muted";
  size?: "sm" | "md" | "lg" | "xl";
  slam?: boolean;
  rotate?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const colors = {
    stamp: "text-stamp border-stamp",
    pass: "text-pass border-pass",
    muted: "text-muted border-muted",
  };
  const sizes = {
    sm: "text-xs px-2 py-0.5 border-2",
    md: "text-base px-3 py-1 border-[3px]",
    lg: "text-3xl px-5 py-2 border-4",
    xl: "text-6xl px-8 py-3 border-[6px]",
  };
  const label = (
    <span
      className={[
        "inline-block rounded-[3px] bg-transparent font-display uppercase leading-none tracking-wider",
        "outline-2 outline-offset-2 [outline-style:solid] mix-blend-multiply",
        colors[tone],
        sizes[size],
        className,
      ].join(" ")}
      style={{ outlineColor: "currentColor" }}
    >
      {children}
    </span>
  );

  if (!slam) {
    return (
      <span className="inline-block" style={{ transform: `rotate(${rotate}deg)` }}>
        {label}
      </span>
    );
  }
  return (
    <motion.span
      className="inline-block"
      role="status"
      initial={reduced ? { opacity: 0, rotate } : { scale: 2.2, opacity: 0, rotate: rotate - 10 }}
      animate={{ scale: 1, opacity: 1, rotate }}
      transition={reduced ? { duration: 0.2 } : { type: "spring", stiffness: 520, damping: 18, mass: 0.9 }}
    >
      {label}
    </motion.span>
  );
}
