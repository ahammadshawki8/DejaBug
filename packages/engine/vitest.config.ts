import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "engine",
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
