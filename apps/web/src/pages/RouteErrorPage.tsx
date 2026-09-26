import { useRouteError } from "react-router-dom";
import { ArcadeButton, PaperPanel, Stamp } from "../components/game";

// Route error screen. A new deploy replaces the hashed screen chunks, so a tab opened before it asks for
// files that no longer exist. That case reloads once to pick up the new build; anything else is shown.

const RELOAD_KEY = "dejabug-chunk-reload";

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(
    message,
  );
}

/** Reloads the page once per minute at most, so a truly missing file cannot cause a reload loop. */
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export function RouteErrorPage() {
  const error = useRouteError();
  const stale = isStaleChunkError(error);
  if (stale && reloadForNewBuild()) return null;
  const home = import.meta.env.BASE_URL;
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink p-6">
      <PaperPanel tone="paper" className="w-full max-w-lg p-8">
        <Stamp size="lg" rotate={-6}>
          {stale ? "New edition" : "File damaged"}
        </Stamp>
        <p className="mt-6 font-typewriter text-text-dark">
          {stale
            ? "DejaBug was updated while this tab was open. Reload to get the latest version."
            : `This screen failed to open: ${error instanceof Error ? error.message : "unknown error"}.`}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ArcadeButton tone="amber" onClick={() => window.location.reload()}>
            Reload
          </ArcadeButton>
          <ArcadeButton tone="navy" onClick={() => window.location.assign(home)}>
            Back to the case board
          </ArcadeButton>
        </div>
      </PaperPanel>
    </div>
  );
}
