import { useEffect, useState } from "react";
import { api, SHOWCASE, type AiStatus } from "../api/client";
import { ArcadeButton, DarkPanel, useToasts } from "../components/game";

// Settings > AI for new cases. Anyone can bring their own watsonx.ai or IBM Bob key; it is saved only in
// this checkout's .env. Without a key the forge still works and writes case files from the tests.

const FIELD =
  "min-w-0 flex-1 border-[3px] border-line bg-paper px-3 py-1.5 font-mono text-sm text-text-dark shadow-hard-sm";

function Field({
  label,
  value,
  onChange,
  placeholder,
  secret = false,
  saved = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
  saved?: boolean;
}) {
  return (
    <label className="flex flex-wrap items-center gap-3">
      <span className="w-40 font-display text-[11px] uppercase text-muted">{label}</span>
      <input
        type={secret ? "password" : "text"}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={saved ? "Saved. Leave blank to keep it." : placeholder}
        aria-label={label}
        className={FIELD}
      />
    </label>
  );
}

function statusLine(s: AiStatus | undefined): string {
  if (!s) return "Checking the engine...";
  if (!s.configured)
    return "No AI key yet. New cases are written from the tests. Add a key for richer, AI-written case files.";
  return s.provider === "bob"
    ? "Using IBM Bob (Bob Shell with the Deja Forger mode) for new case files."
    : `Using IBM watsonx.ai (${s.watsonx.modelId ?? "Granite"}) for new case files.`;
}

export function AiKeyPanel() {
  const push = useToasts((s) => s.push);
  const [status, setStatus] = useState<AiStatus>();
  const [provider, setProvider] = useState<"watsonx" | "bob">("watsonx");
  const [apiKey, setApiKey] = useState("");
  const [projectId, setProjectId] = useState("");
  const [modelId, setModelId] = useState("");
  const [bobKey, setBobKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (SHOWCASE) return;
    api
      .aiStatus()
      .then((s) => {
        setStatus(s);
        setProvider(s.provider);
      })
      .catch(() => undefined);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const s = await api.saveAi(
        provider === "bob"
          ? { provider, bobApiKey: bobKey }
          : { provider, watsonxApiKey: apiKey, watsonxProjectId: projectId, watsonxModelId: modelId },
      );
      setStatus(s);
      setApiKey("");
      setProjectId("");
      setBobKey("");
      push(
        s.configured ? "Saved. New forge runs use your key." : "Saved. Some fields are still missing.",
        "success",
      );
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DarkPanel title="AI for new cases" className="px-6 py-4">
      {SHOWCASE ? (
        <p className="text-sm text-muted">
          The showcase has no engine. Install DejaBug locally to forge cases from your own repository; you can
          add your own watsonx.ai or IBM Bob key here, or forge without one.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className={`text-sm ${status?.configured ? "text-pass" : "text-amber"}`} aria-live="polite">
            {statusLine(status)}
          </p>
          <div
            role="radiogroup"
            aria-label="AI provider"
            className="flex w-fit border-[3px] border-line shadow-hard-sm"
          >
            {(
              [
                ["watsonx", "IBM watsonx.ai"],
                ["bob", "IBM Bob"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={provider === id}
                onClick={() => setProvider(id)}
                className={`px-3 py-1.5 font-display text-[11px] uppercase ${
                  provider === id ? "bg-amber text-line" : "bg-navy-2 text-paper hover:text-amber"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {provider === "watsonx" ? (
              <>
                <Field
                  label="API key"
                  value={apiKey}
                  onChange={setApiKey}
                  secret
                  saved={status?.watsonx.apiKey}
                />
                <Field
                  label="Project ID"
                  value={projectId}
                  onChange={setProjectId}
                  saved={status?.watsonx.projectId}
                />
                <Field
                  label="Model ID"
                  value={modelId}
                  onChange={setModelId}
                  placeholder={status?.watsonx.modelId ?? "ibm/granite-4-h-small"}
                />
              </>
            ) : (
              <Field
                label="Bob API key"
                value={bobKey}
                onChange={setBobKey}
                secret
                saved={status?.bob.apiKey}
              />
            )}
            <div className="flex flex-wrap items-center gap-3">
              <ArcadeButton tone="amber" size="sm" type="submit" disabled={saving}>
                {saving ? "Saving" : "Save key"}
              </ArcadeButton>
              <span className="text-xs text-muted">
                Stored only in this folder's .env file on your machine. It is never shown again or uploaded.
              </span>
            </div>
          </form>
        </div>
      )}
    </DarkPanel>
  );
}
