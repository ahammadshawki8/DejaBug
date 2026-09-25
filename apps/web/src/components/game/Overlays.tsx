import { AnimatePresence, motion } from "framer-motion";
import { Close } from "pixelarticons/react/Close.js";
import { useEffect, useRef, type ReactNode } from "react";
import { create } from "zustand";
import { PaperClip } from "../../art/sprites";
import { useReducedMotion } from "../../state/settings";

// Overlays (6A.10): arcade modal, clipped-note toasts, tooltip.

export function Modal({
  open,
  onClose,
  title,
  children,
  tone = "navy",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  tone?: "navy" | "stamp";
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            initial={reduced ? { opacity: 0 } : { scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { scale: 0.95, opacity: 0 }}
            className={`relative w-full max-w-lg rounded-[2px] border-4 border-line shadow-hard-lg ${
              tone === "stamp" ? "bg-stamp" : "bg-navy-2"
            }`}
          >
            <div className="flex items-center justify-between border-b-4 border-line px-5 py-3">
              <h2 className="font-display text-lg uppercase text-paper">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-paper hover:text-amber"
              >
                <Close className="size-6" />
              </button>
            </div>
            <div className="p-5 text-paper">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

interface Toast {
  id: number;
  text: string;
  tone: "info" | "success" | "error";
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, tone?: Toast["tone"]) => void;
  dismiss: (id: number) => void;
}

let nextToast = 1;
export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (text, tone = "info") => {
    const id = nextToast++;
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
    window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Toasts render as clipped notes in the bottom-right corner. */
export function ToastStack() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-3"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 40, rotate: 2 }}
            animate={{ opacity: 1, x: 0, rotate: -1 }}
            exit={{ opacity: 0, x: 40 }}
            className={[
              "pointer-events-auto relative rounded-[2px] border-[3px] border-line px-4 pt-4 pb-3 text-sm shadow-hard",
              t.tone === "error"
                ? "bg-stamp text-paper"
                : t.tone === "success"
                  ? "bg-pass text-line"
                  : "bg-paper text-text-dark",
            ].join(" ")}
          >
            <span className="absolute -top-3 left-4">
              <PaperClip size={20} />
            </span>
            <button
              type="button"
              className="float-right ml-2"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
            >
              <Close className="size-4" />
            </button>
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-40 ml-3 -translate-y-1/2 whitespace-nowrap rounded-[2px] border-2 border-line bg-paper px-2 py-1 font-display text-[11px] uppercase text-text-dark opacity-0 shadow-hard-sm transition-opacity group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
