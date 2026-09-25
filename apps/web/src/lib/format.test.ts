import { describe, expect, it } from "vitest";
import { formatDuration } from "./format";

describe("formatDuration", () => {
  it("formats minutes and seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(692)).toBe("11:32");
  });

  it("formats hours", () => {
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("clamps negatives and fractions", () => {
    expect(formatDuration(-5)).toBe("0:00");
    expect(formatDuration(9.9)).toBe("0:09");
  });
});
