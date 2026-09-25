import { goAdapter } from "./go.js";
import { pythonAdapter } from "./python.js";
import type { LanguageAdapter } from "./types.js";

export * from "./errors.js";
export type * from "./types.js";

/** Registered language adapters, in detection order. */
export const ADAPTERS: LanguageAdapter[] = [goAdapter, pythonAdapter];

export function getAdapter(id: string): LanguageAdapter {
  const adapter = ADAPTERS.find((a) => a.id === id);
  if (!adapter)
    throw new Error(`no language adapter "${id}" (available: ${ADAPTERS.map((a) => a.id).join(", ")})`);
  return adapter;
}

/** The adapter for the repository at `repoDir`, or undefined when no supported language is detected. */
export function detectAdapter(repoDir: string): LanguageAdapter | undefined {
  return ADAPTERS.find((a) => a.detect(repoDir));
}
