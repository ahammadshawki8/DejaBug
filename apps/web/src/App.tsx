import { useEffect, useState } from "react";

type Health = { ok: boolean; repo: string } | null;

// Placeholder shell. The real game UI arrives in T5 (PROJECT.md Section 6A).
export function App() {
  const [health, setHealth] = useState<Health>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : null))
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 32 }}>
      <h1>DejaBug</h1>
      <p>Your team's past bugs, replayed as certified onboarding cases.</p>
      <p>Engine: {health ? `connected (${health.repo})` : "offline"}</p>
    </main>
  );
}
