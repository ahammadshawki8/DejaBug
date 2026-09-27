import { describe, expect, it } from "vitest";
import { aiEnvEntries, upsertEnv } from "./aiSettings.js";

describe("AI key settings", () => {
  it("replaces existing lines and appends new ones, keeping the rest", () => {
    const before = "# comment\nGITHUB_TOKEN=abc\nWATSONX_API_KEY=old\n";
    const after = upsertEnv(before, { WATSONX_API_KEY: "new", WATSONX_PROJECT_ID: "p1" });
    expect(after).toBe("# comment\nGITHUB_TOKEN=abc\nWATSONX_API_KEY=new\nWATSONX_PROJECT_ID=p1\n");
  });

  it("keeps saved values when a field is left blank", () => {
    expect(aiEnvEntries({ provider: "watsonx", watsonxApiKey: "  " })).toEqual({ LLM_PROVIDER: "watsonx" });
  });

  it("rejects line breaks, banned models and non-https URLs", () => {
    expect(() => aiEnvEntries({ provider: "bob", bobApiKey: "a\nLLM_PROVIDER=x" })).toThrow(/single line/);
    expect(() =>
      aiEnvEntries({ provider: "watsonx", watsonxModelId: "mistralai/mistral-medium-2505" }),
    ).toThrow(/not allowed/);
    expect(() => aiEnvEntries({ provider: "watsonx", watsonxUrl: "http://evil.example" })).toThrow(/https/);
    expect(() => aiEnvEntries({ provider: "openai" as never })).toThrow(/provider/);
  });
});
