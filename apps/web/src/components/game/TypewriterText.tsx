import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../state/settings";

// Typewriter reveal for case reports (6A.7 W2). Click, Space or Enter finishes it instantly.
// Screen readers get the full text immediately.

export function TypewriterText({
  text,
  cps = 90,
  className = "",
  onDone,
}: {
  text: string;
  cps?: number;
  className?: string;
  onDone?: () => void;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? text.length : 0);
  const done = shown >= text.length;
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  // Restart when the text changes (derived state during render, no effect needed).
  const [prevText, setPrevText] = useState(text);
  if (prevText !== text) {
    setPrevText(text);
    setShown(reduced ? text.length : 0);
  }

  useEffect(() => {
    if (done) {
      doneRef.current?.();
      return;
    }
    const step = Math.max(1, Math.round(cps / 30));
    const id = window.setTimeout(() => setShown((n) => Math.min(text.length, n + step)), 1000 / 30);
    return () => window.clearTimeout(id);
  }, [shown, done, cps, text.length]);

  useEffect(() => {
    if (done) return;
    const finish = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "BUTTON" || tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        setShown(text.length);
      }
    };
    window.addEventListener("keydown", finish);
    return () => window.removeEventListener("keydown", finish);
  }, [done, text.length]);

  return (
    <p className={`font-typewriter ${className}`} onClick={() => setShown(text.length)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.slice(0, shown)}
        {!done ? (
          <span className="ml-0.5 inline-block h-[1em] w-[0.55em] translate-y-[0.15em] animate-pulse bg-current" />
        ) : null}
      </span>
    </p>
  );
}
