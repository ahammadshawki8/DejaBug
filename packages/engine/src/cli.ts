#!/usr/bin/env node
import { createServer } from "node:http";
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { runDoctor } from "./doctor.js";

const program = new Command();

program
  .name("dejabug")
  .description("Mine, certify, and brief real bug fixes into training cases.")
  .version("0.1.0");

program
  .command("doctor")
  .description("check git, go, the target repo, Bob Shell, and watsonx configuration")
  .action(() => {
    const checks = runDoctor(loadConfig());
    for (const c of checks) console.log(`${c.ok ? "OK  " : "MISS"}  ${c.name.padEnd(12)} ${c.detail}`);
  });

program
  .command("serve")
  .description("start the local engine server (full API arrives in T4.3)")
  .action(() => {
    const config = loadConfig();
    const server = createServer((req, res) => {
      if (req.url === "/api/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, repo: config.repoSlug }));
        return;
      }
      res.writeHead(404).end();
    });
    server.listen(config.port, () =>
      console.log(`dejabug engine listening on http://localhost:${config.port}`),
    );
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
