import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const root = path.resolve("/tmp/dejabug");

describe("loadConfig", () => {
  it("defaults to sarama paths and the watsonx provider", () => {
    const c = loadConfig({}, root);
    expect(c.repoSlug).toBe("IBM/sarama");
    expect(c.repoDir).toBe(path.join(root, "workspace", "sarama"));
    expect(c.casesDir).toBe(path.join(root, "cases", "sarama"));
    expect(c.llmProvider).toBe("watsonx");
    expect(c.port).toBe(4317);
  });

  it("honours overrides", () => {
    const c = loadConfig({ LLM_PROVIDER: "BOB", DEJABUG_PORT: "9000", GITHUB_TOKEN: "" }, root);
    expect(c.llmProvider).toBe("bob");
    expect(c.port).toBe(9000);
    expect(c.githubToken).toBeUndefined();
  });

  it("rejects an unknown provider", () => {
    expect(() => loadConfig({ LLM_PROVIDER: "openai" }, root)).toThrow(/LLM_PROVIDER/);
  });
});
