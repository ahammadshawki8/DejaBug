import type { ReactNode } from "react";
import { PaperPanel } from "../components/game";

// Temporary body for screens that are still being built (each names its checklist item).

export function Placeholder({ item, children }: { item: string; children?: ReactNode }) {
  return (
    <PaperPanel tone="manila" pinned className="mt-6 max-w-xl p-6">
      <p className="font-typewriter text-lg">This room is still being furnished ({item}).</p>
      {children}
    </PaperPanel>
  );
}
