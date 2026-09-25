import { describe, expect, it } from "vitest";
import { casesNeedingRename, ensureUniqueCodenames, normalizeCodename } from "./codenames.js";
import type { Case } from "./types.js";

function kase(id: string, codename: string): Case {
  return { id, brief: { codename, symptoms: "s", precinct: "protocol" } } as unknown as Case;
}

describe("codenames", () => {
  it("normalizes articles, case and punctuation", () => {
    expect(normalizeCodename("The Phantom Slice!")).toBe("phantom slice");
    expect(normalizeCodename("Phantom-Slice")).toBe("phantomslice");
  });

  it("flags repeats after the first use and any copied skill example", () => {
    const cases = [kase("a1", "Night Ledger"), kase("b2", "night ledger"), kase("c3", "The Phantom Slice")];
    expect(casesNeedingRename(cases).map((c) => c.id)).toEqual(["b2", "c3"]);
  });

  it("renames until the name is unique, skipping taken names", async () => {
    const cases = [kase("a1", "Night Ledger"), kase("b2", "Night Ledger"), kase("c3", "Phantom Slice")];
    const proposals = ["Night Ledger", "Silent Quorum", "Broken Compass"];
    const renamed = await ensureUniqueCodenames(cases, async () => proposals.shift()!);
    expect(renamed.map((c) => c.id)).toEqual(["b2", "c3"]);
    expect(cases.map((c) => c.brief.codename)).toEqual(["Night Ledger", "Silent Quorum", "Broken Compass"]);
  });
});
