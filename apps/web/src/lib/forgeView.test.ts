import { describe, expect, it } from "vitest";
import type { ForgeEvent } from "../api/client";
import { initial, reduce, type ForgeView } from "./forgeView";

function run(events: ForgeEvent[], workers = 2): ForgeView {
  return events.reduce(
    (v, e) => reduce(v, { type: "event", e }),
    reduce(initial(workers), { type: "reset", workers }),
  );
}

describe("forge view reducer", () => {
  it("moves a certified case through certify and brief into the locker", () => {
    const v = run([
      { type: "stage", worker: 0, fixSha: "aaa1111", stage: "certify", detail: "fix: guard overflow" },
      { type: "run", worker: 0, fixSha: "aaa1111", phase: "fail", attempt: 1, ok: true },
      { type: "run", worker: 0, fixSha: "aaa1111", phase: "fail", attempt: 2, ok: true },
    ]);
    expect(v.lanes[0]).toMatchObject({ sha: "aaa1111", stage: "certify", failLights: [true, true] });
    expect(v.lanes[0]?.subject).toBe("fix: guard overflow");

    const done = run([
      { type: "stage", worker: 0, fixSha: "aaa1111", stage: "certify", detail: "fix: guard overflow" },
      { type: "result", worker: 0, fixSha: "aaa1111", status: "certified" },
      { type: "stage", worker: 1, fixSha: "aaa1111", stage: "brief", detail: "fix: guard overflow" },
      { type: "briefed", worker: 1, fixSha: "aaa1111", ok: true, codename: "The Overflowing Slice" },
      { type: "done" },
    ]);
    expect(done.locker).toEqual([{ sha: "aaa1111", codename: "The Overflowing Slice" }]);
    expect(done.running).toBe(false);
    expect(done.lanes.every((l) => l.stage === "idle")).toBe(true);
  });

  it("sends rejections to the discard bin with their reason", () => {
    const v = run([
      { type: "stage", worker: 1, fixSha: "bbb2222", stage: "certify", detail: "fix: typo" },
      { type: "result", worker: 1, fixSha: "bbb2222", status: "rejected:no-fail" },
    ]);
    expect(v.discard).toEqual([{ sha: "bbb2222", subject: "fix: typo", reason: "no-fail" }]);
    expect(v.lanes[1]?.stage).toBe("idle");
  });

  it("keeps the log bounded and tracks the funnel", () => {
    const events: ForgeEvent[] = Array.from({ length: 80 }, (_, i) => ({
      type: "log",
      message: `line ${i}`,
    }));
    const v = run(events);
    expect(v.log).toHaveLength(60);
    expect(v.log.at(-1)).toBe("line 79");
  });
});
