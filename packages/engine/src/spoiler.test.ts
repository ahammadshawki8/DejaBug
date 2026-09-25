import { describe, expect, it } from "vitest";
import { checkSpoilers, extractSpoilers } from "./spoiler.js";

const diff = [
  "diff --git a/client.go b/client.go",
  "--- a/client.go",
  "+++ b/client.go",
  "@@ -10,3 +10,4 @@ func (c *client) RefreshMetadata() error {",
  "-\tc.brokers[id] = broker",
  "+\tif existing, ok := c.brokers[id]; ok && existing != broker {",
  "+\t\tc.deregisterBroker(existing)",
  '+\t\tLogger.Printf("replacing stale broker registration")',
  "+\t}",
].join("\n");

describe("extractSpoilers", () => {
  it("keeps identifiers and literals the fix introduced, not ones it only moved", () => {
    const spoilers = extractSpoilers(diff);
    expect(spoilers).toContain("deregisterBroker");
    expect(spoilers).toContain("existing");
    expect(spoilers).toContain("replacing stale broker registration");
    expect(spoilers).not.toContain("brokers"); // also on the removed line
    expect(spoilers).not.toContain("Printf"); // stop word
  });
});

describe("checkSpoilers", () => {
  const clean = {
    symptoms: "After a broker restarts, the client keeps talking to a dead connection and requests hang.",
    evidence: "--- FAIL: TestClientReregister (0.00s)",
    hints: [
      "Look at what happens to the old entry.",
      "Maps can silently overwrite.",
      "Close before you replace.",
    ] as [string, string, string],
  };

  it("passes a brief that describes symptoms without naming the fix", () => {
    expect(checkSpoilers(clean, diff)).toEqual([]);
  });

  it("flags whole-word identifiers and literals from the fix", () => {
    const leaky = {
      ...clean,
      hints: ["Call deregisterBroker first.", "", "Log replacing stale broker registration"] as [
        string,
        string,
        string,
      ],
    };
    expect(checkSpoilers(leaky, diff)).toEqual(["deregisterBroker", "replacing stale broker registration"]);
  });

  it("does not flag substrings of longer words", () => {
    const b = { ...clean, symptoms: "nonexisting brokers vanish" };
    expect(checkSpoilers(b, diff)).toEqual([]);
  });
});
