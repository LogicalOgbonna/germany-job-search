import { spawn, spawnSync } from "node:child_process";
// A backup on start unless one was made in the last hour (restarts come often); a failed
// backup does not stop Jobdesk from starting. db:migrate always backs up.
spawnSync("node", ["scripts/db-backup.mjs", "--if-older=3600"], {
  stdio: "inherit",
});
// Portless assigns PORT; Conductor's allocation remains the direct-run fallback.
const port = process.env.PORT ?? process.env.CONDUCTOR_PORT ?? "55010";
const children = [
  spawn(
    "node",
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      port,
    ],
    { stdio: "inherit" },
  ),
  spawn("node", ["--import", "tsx", "scripts/worker.ts"], { stdio: "inherit" }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((c) => c.kill("SIGTERM"));
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
children.forEach((c) => {
  c.on("error", (e) => {
    console.error(e.message);
    stop(1);
  });
  c.on("exit", (code) => stop(code ?? 0));
});
