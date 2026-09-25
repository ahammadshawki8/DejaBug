import type { Config } from "./config.js";
import { extractJson, WatsonxClient } from "./llm/watsonx.js";
import type { Case } from "./types.js";

// Every case on the board needs its own evocative codename. Models tend to reuse the examples
// they were shown, so after a batch we rename duplicates (and known example names) one by one.

/** Example names from the forge-case skill that must never be used verbatim. */
const EXAMPLE_NAMES = ["the phantom slice", "midnight rebalance"];

export function normalizeCodename(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

/** Cases whose codename repeats an earlier case's name or copies a skill example. First use wins. */
export function casesNeedingRename(cases: Case[]): Case[] {
  const seen = new Set<string>();
  const banned = new Set(EXAMPLE_NAMES.map(normalizeCodename));
  const out: Case[] = [];
  for (const c of [...cases].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = normalizeCodename(c.brief.codename);
    if (seen.has(key) || banned.has(key)) out.push(c);
    else seen.add(key);
  }
  return out;
}

export type NameFn = (c: Case, taken: string[]) => Promise<string>;

/** Asks the configured watsonx model for one fresh codename, given the names already taken. */
export function watsonxNamer(config: Config): NameFn {
  const client = WatsonxClient.fromConfig(config);
  const model = config.watsonx.modelId;
  if (!model) throw new Error("WATSONX_MODEL_ID is not set");
  return async (c, taken) => {
    const raw = await client.chat(
      model,
      [
        {
          role: "system",
          content:
            "You name cold-case files for a debugging game. Reply with JSON only: " +
            '{"codename": "<2-4 word evocative detective title>"}. The title must not describe the fix, ' +
            "must not contain code identifiers, and must not use the word Phantom.",
        },
        {
          role: "user",
          content:
            `Precinct: ${c.brief.precinct}\nSymptoms: ${c.brief.symptoms}\n` +
            `Names already taken (do not reuse or closely imitate): ${taken.join("; ")}`,
        },
      ],
      { json: true, maxTokens: 40, temperature: 0.9 },
    );
    const name = (extractJson(raw) as { codename?: unknown }).codename;
    if (typeof name !== "string" || !name.trim()) throw new Error("no codename in model output");
    return name.trim().replace(/[.!"]+$/g, "");
  };
}

/** Renames duplicate or example codenames in place. Returns the renamed cases. */
export async function ensureUniqueCodenames(cases: Case[], nameFn: NameFn, maxAttempts = 3): Promise<Case[]> {
  const renamed: Case[] = [];
  for (const c of casesNeedingRename(cases)) {
    const taken = cases.filter((x) => x !== c).map((x) => x.brief.codename);
    const takenKeys = new Set([...taken, ...EXAMPLE_NAMES].map(normalizeCodename));
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const name = await nameFn(c, taken);
      if (!takenKeys.has(normalizeCodename(name))) {
        c.brief.codename = name;
        renamed.push(c);
        break;
      }
    }
  }
  return renamed;
}
