import { Sliders } from "pixelarticons/react/Sliders.js";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ArcadeButton, DarkPanel, Modal, PaperPanel, useToasts } from "../components/game";
import { useGame } from "../state/game";
import { useProfile } from "../state/profile";
import { useSettings } from "../state/settings";
import { usePageTitle } from "./pageTitle";

// Settings (PROJECT.md 6A.7): repository, sound, motion, profile reset, engine details.

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-navy-2 py-4 last:border-b-0">
      <div>
        <div className="font-display text-xs uppercase">{label}</div>
        {hint ? <div className="mt-1 text-sm text-muted">{hint}</div> : null}
      </div>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex border-[3px] border-line shadow-hard-sm">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 font-display text-[11px] uppercase ${
            o.id === value ? "bg-amber text-line" : "bg-navy-2 text-paper hover:text-amber"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsPage() {
  usePageTitle("Settings", <Sliders />);
  const settings = useSettings();
  const { repos, loadRepos, loadCases } = useGame();
  const { profile, save } = useProfile();
  const push = useToasts((s) => s.push);
  const [engineRepo, setEngineRepo] = useState<string>();
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    void loadRepos();
    api
      .health()
      .then((h) => setEngineRepo(h.repo))
      .catch(() => setEngineRepo(undefined));
  }, [loadRepos]);

  const currentRepo = settings.repo ?? repos.find((r) => r.default)?.name;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-2">
      <DarkPanel title="Precinct archive" className="px-6">
        <Row label="Repository" hint="Which repository's cases fill the board. Add more from the Forge.">
          <select
            aria-label="Repository"
            value={currentRepo ?? ""}
            onChange={(e) => {
              const name = e.target.value;
              const def = repos.find((r) => r.default)?.name;
              settings.setRepo(name === def ? undefined : name);
              void loadCases(name === def ? undefined : name, true);
              push(`Switched to ${repos.find((r) => r.name === name)?.slug ?? name}.`, "info");
            }}
            className="border-[3px] border-line bg-paper px-3 py-1.5 font-display text-xs uppercase text-text-dark shadow-hard-sm"
          >
            {repos.map((r) => (
              <option key={r.name} value={r.name}>
                {r.slug} ({r.caseCount} cases{r.language ? `, ${r.language}` : ""})
              </option>
            ))}
          </select>
        </Row>
      </DarkPanel>

      <DarkPanel title="Sound and motion" className="px-6">
        <Row label="Sound effects" hint="Short synthesized blips, stamps and fanfares.">
          <ArcadeButton tone={settings.soundOn ? "amber" : "navy"} size="sm" onClick={settings.toggleSound}>
            {settings.soundOn ? "On" : "Off"}
          </ArcadeButton>
        </Row>
        <Row label="Volume">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            onChange={(e) => settings.setVolume(Number(e.target.value))}
            aria-label="Volume"
            className="w-40 accent-amber"
            disabled={!settings.soundOn}
          />
          <span className="tabular w-10 font-mono text-sm">{Math.round(settings.volume * 100)}%</span>
        </Row>
        <Row label="Reduced motion" hint="Replaces stamps, shakes and slides with simple fades.">
          <Segmented
            label="Reduced motion"
            value={settings.reducedMotion}
            onChange={settings.setReducedMotion}
            options={[
              { id: "system", label: "System" },
              { id: "on", label: "On" },
              { id: "off", label: "Off" },
            ]}
          />
        </Row>
      </DarkPanel>

      <DarkPanel title="Detective record" className="px-6">
        <Row
          label="Profile"
          hint={`${profile.xp.toLocaleString()} XP, ${profile.solves.length} cases closed.`}
        >
          <ArcadeButton tone="stamp" size="sm" onClick={() => setConfirmReset(true)}>
            Reset profile
          </ArcadeButton>
        </Row>
      </DarkPanel>

      <PaperPanel tone="paper" className="p-6 text-sm">
        <div className="font-display text-xs uppercase">Engine</div>
        <p className="mt-2">
          {engineRepo
            ? `Connected to the local DejaBug engine on port 4317 (default repository ${engineRepo}).`
            : "The local engine is not reachable. Start it with npm run dev from the project folder."}
        </p>
      </PaperPanel>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset profile?" tone="stamp">
        <p>This clears your XP, closed cases and badges. Case sessions on the engine are kept.</p>
        <div className="mt-5 flex gap-3">
          <ArcadeButton
            tone="paper"
            onClick={() => {
              void save({ ...profile, xp: 0, solves: [], badges: [] });
              setConfirmReset(false);
              push("Profile reset. Welcome back, Rookie.", "info");
            }}
          >
            Reset
          </ArcadeButton>
          <ArcadeButton tone="navy" onClick={() => setConfirmReset(false)}>
            Keep my record
          </ArcadeButton>
        </div>
      </Modal>
    </div>
  );
}
