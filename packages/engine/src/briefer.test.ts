import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "./config.js";
import type { BriefInput } from "./briefer.js";
import type * as fsModule from "node:fs";
import type * as watsonxModule from "./llm/watsonx.js";

// ---------------------------------------------------------------------------
// Hoist mutable state so vi.mock factories can close over it.
// ---------------------------------------------------------------------------

const { mockReadFileSync, mockChat } = vi.hoisted(() => {
  const mockReadFileSync = vi.fn<() => string>();
  const mockChat = vi.fn<(...args: unknown[]) => Promise<string>>();
  return { mockReadFileSync, mockChat };
});

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof fsModule>();
  return { ...real, readFileSync: mockReadFileSync };
});

vi.mock("./llm/watsonx.js", async (importOriginal) => {
  const real = await importOriginal<typeof watsonxModule>();
  return {
    ...real,
    WatsonxClient: class extends real.WatsonxClient {
      static override fromConfig(_config: Config) {
        return { chat: mockChat } as never;
      }
    },
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SKILL_TEXT = "# forge-case\nOutput a JSON Brief.";

const VALID_BRIEF_JSON = JSON.stringify({
  codename: "Silent Drop",
  symptoms: "Messages stop being consumed after a rebalance with no error reported.",
  evidence: "--- FAIL: TestConsumerGroupRebalance (1.23s)\nexpected 10 messages, got 0",
  hints: [
    "The consumer appears healthy but stops processing after a group event.",
    "Look at what happens in the consumer-group session lifecycle.",
    "A goroutine that should signal completion never does so under the error path.",
  ],
  difficulty: 2,
  precinct: "consumer-group",
  lesson: "The session close did not call wg.Done when rebalance returned an error.",
  tags: ["consumer-group", "goroutine-leak"],
});

// A brief that contains a spoiler token present only in the added lines of SPOILER_DIFF.
const SPOILERTOKEN = "uniqueFixedFuncXYZ";
const SPOILER_BRIEF_JSON = JSON.stringify({
  codename: "Silent Drop",
  symptoms: `Use ${SPOILERTOKEN} to fix the issue.`,
  evidence: "--- FAIL: TestConsumerGroupRebalance (1.23s)",
  hints: [
    "Hint one does not reveal the fix.",
    "Hint two does not reveal the fix.",
    "Hint three does not reveal the fix.",
  ],
  difficulty: 2,
  precinct: "consumer-group",
  lesson: "The fix introduced uniqueFixedFuncXYZ.",
  tags: ["consumer-group"],
});

// A diff whose added line introduces SPOILERTOKEN.
const SPOILER_DIFF = [
  "diff --git a/consumer.go b/consumer.go",
  "--- a/consumer.go",
  "+++ b/consumer.go",
  "@@ -10,3 +10,4 @@",
  "-\treturn nil",
  `+\t${SPOILERTOKEN}()`,
].join("\n");

// A diff with no meaningful new identifiers.
const CLEAN_DIFF = [
  "diff --git a/consumer.go b/consumer.go",
  "--- a/consumer.go",
  "+++ b/consumer.go",
  "@@ -1 +1 @@",
  "-\treturn false",
  "+\treturn true",
].join("\n");

const BASE_INPUT: BriefInput = {
  candidate: {
    fixSha: "aabbcc",
    parentSha: "112233",
    subject: "Fix consumer group hang",
    date: "2024-01-01T00:00:00Z",
    language: "go",
    sourceFiles: ["consumer.go"],
    testFiles: ["consumer_test.go"],
    packages: ["."],
    tests: ["TestConsumerGroupRebalance"],
  },
  certification: {
    fixSha: "aabbcc",
    status: "certified",
    failRuns: 3,
    passRuns: 3,
    failOutput: "--- FAIL: TestConsumerGroupRebalance (1.23s)",
    passOutput: "ok",
    durationMs: 5000,
  },
  context: {
    prTitle: "Fix consumer group hang after rebalance",
    prBody: "Fixes a goroutine leak.",
    issueTitle: "Consumer hangs after rebalance",
    issueBody: "Reproducible with high load.",
    combinedComments: "This blocks production.",
  },
  fixDiff: CLEAN_DIFF,
};

const BASE_CONFIG: Config = {
  repoRoot: "/fake/root",
  repoDir: "/fake/root/workspace/sarama",
  repoSlug: "IBM/sarama",
  casesDir: "/fake/root/cases/sarama",
  playgroundsDir: "/fake/root/playgrounds",
  port: 4317,
  llmProvider: "watsonx",
  watsonx: {
    apiKey: "key",
    projectId: "proj",
    url: "https://us-south.ml.cloud.ibm.com",
    modelId: "ibm/granite-3-3-8b-instruct",
  },
  bobMaxCost: 1,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("briefer", () => {
  beforeEach(() => {
    mockReadFileSync.mockReturnValue(SKILL_TEXT);
    mockChat.mockResolvedValue(VALID_BRIEF_JSON);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a valid Brief when the LLM outputs correct JSON with no spoilers", async () => {
    const { brief } = await import("./briefer.js");
    const result = await brief(BASE_INPUT, BASE_CONFIG);

    expect(result).not.toBeNull();
    expect(result?.codename).toBe("Silent Drop");
    expect(result?.difficulty).toBe(2);
    expect(result?.hints).toHaveLength(3);
    expect(result?.precinct).toBe("consumer-group");
  });

  it("returns null when the LLM returns unparseable output", async () => {
    mockChat.mockResolvedValue("This is not JSON at all.");
    const { brief } = await import("./briefer.js");
    const result = await brief(BASE_INPUT, BASE_CONFIG);
    expect(result).toBeNull();
  });

  it("returns null when the LLM returns JSON that fails Zod validation", async () => {
    const badJson = JSON.stringify({ codename: "X", difficulty: 99 }); // missing fields + bad difficulty
    mockChat.mockResolvedValue(badJson);
    const { brief } = await import("./briefer.js");
    const result = await brief(BASE_INPUT, BASE_CONFIG);
    expect(result).toBeNull();
  });

  it("retries when the first response contains spoilers and returns clean Brief on retry", async () => {
    mockChat
      .mockResolvedValueOnce(SPOILER_BRIEF_JSON) // first: contains spoiler
      .mockResolvedValueOnce(VALID_BRIEF_JSON); // retry: clean

    const { brief } = await import("./briefer.js");
    const inputWithSpoilerDiff = { ...BASE_INPUT, fixDiff: SPOILER_DIFF };
    const result = await brief(inputWithSpoilerDiff, BASE_CONFIG);

    expect(result).not.toBeNull();
    expect(result?.codename).toBe("Silent Drop");
    // chat must have been called twice: initial + retry
    expect(mockChat).toHaveBeenCalledTimes(2);
    // The second call's user message should mention the spoiler token.
    const secondCallMessages = mockChat.mock.calls[1]?.[1] as unknown as Array<{
      role: string;
      content: string;
    }>;
    const userMsg = secondCallMessages?.find((m) => m.role === "user")?.content ?? "";
    expect(userMsg).toContain(SPOILERTOKEN);
  });

  it("returns null when spoilers remain after the retry", async () => {
    // Both attempts return the spoiler-containing brief.
    mockChat.mockResolvedValue(SPOILER_BRIEF_JSON);

    const { brief } = await import("./briefer.js");
    const inputWithSpoilerDiff = { ...BASE_INPUT, fixDiff: SPOILER_DIFF };
    const result = await brief(inputWithSpoilerDiff, BASE_CONFIG);

    expect(result).toBeNull();
    expect(mockChat).toHaveBeenCalledTimes(2);
  });

  it("returns null when the skill file cannot be read", async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file");
    });

    const { brief } = await import("./briefer.js");
    const result = await brief(BASE_INPUT, BASE_CONFIG);
    expect(result).toBeNull();
  });
});
