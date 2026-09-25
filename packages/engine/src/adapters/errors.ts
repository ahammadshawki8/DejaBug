/** The test process had to be killed because it exceeded the hard process timeout. */
export class TimeoutError extends Error {
  constructor(message = "test process timed out and was killed") {
    super(message);
    this.name = "TimeoutError";
  }
}

/** The language toolchain (go, python, ...) is not installed or not on PATH. */
export class ToolMissingError extends Error {
  constructor(readonly tool: string) {
    super(
      `"${tool}" is not on PATH in this terminal. Install it, open a new terminal, and run \`dejabug doctor\`.`,
    );
    this.name = "ToolMissingError";
  }
}
