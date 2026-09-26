import { describe, expect, it } from "vitest";
import { parseRepoInput } from "./repoInput";

describe("parseRepoInput", () => {
  it("accepts owner/name and GitHub URLs", () => {
    expect(parseRepoInput("IBM/sarama")).toBe("IBM/sarama");
    expect(parseRepoInput(" https://github.com/pallets/click.git/ ")).toBe("pallets/click");
    expect(parseRepoInput("git@github.com:psf/requests.git")).toBe("psf/requests");
  });

  it("rejects input without an owner and a name", () => {
    expect(parseRepoInput("sarama")).toBeUndefined();
    expect(parseRepoInput("")).toBeUndefined();
  });
});
