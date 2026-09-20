import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { PID_FILE } from "./config";

// The pid file names the running server (bun run stop stops it). One that
// names another live process means a server is already running from here,
// so this one stops with a clear message instead of failing on the port.

export function readPid(file: string): number {
  try {
    return parseInt(readFileSync(file, "utf8"), 10) || 0;
  } catch {
    return 0; // no pid file: nobody holds it
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as { code?: string }).code === "EPERM"; // alive, just not ours to signal
  }
}

let claimed: { file: string; pid: number } | null = null;

// Only a live *duckdown* stops us starting. In a container the app is a low
// pid and the file can outlive a hard kill on a mounted volume: "pid 1 is
// alive" is then always true, so liveness alone would refuse to start for
// good — a crash loop with no bad input.
export function heldByDuckie(pid: number): boolean {
  return isAlive(pid) && isDuckie(pid);
}

export function claimPidFile(file = PID_FILE, pid = process.pid, held = heldByDuckie): void {
  if (!file) return;
  const holder = readPid(file);
  if (holder && holder !== pid && held(holder)) {
    throw new Error(`duckie is already running as pid ${holder} (${file}). Stop it first, or set DUCKDOWN_PID to another path.`);
  }
  writeFileSync(file, `${pid}\n`);
  claimed = { file, pid };

  // bun --hot re-runs this module in the same process on every reload:
  // register the cleanup once per process (globalThis outlives reloads).
  const g = globalThis as { duckiePidHandlers?: boolean };
  if (g.duckiePidHandlers) return;
  g.duckiePidHandlers = true;
  process.on("exit", releasePidFile);
  process.on("SIGINT", exitOnSignal);
  process.on("SIGTERM", exitOnSignal);
}

// Remove the pid file, if it is still the one this process wrote.
export function releasePidFile(): void {
  if (claimed && readPid(claimed.file) === claimed.pid) unlinkSync(claimed.file);
}

// Leave through "exit", so the pid file goes with us: 128 + the signal number.
export function exitOnSignal(signal: string): void {
  process.exit(signal === "SIGINT" ? 130 : 143);
}

// Only signal what really is a duckdown server: the number in a stale pid
// file may since have been handed to some unrelated process.
function isDuckie(pid: number): boolean {
  return Bun.spawnSync(["ps", "-o", "command=", "-p", String(pid)]).stdout.toString().includes("main.ts");
}

// bun run stop: SIGTERM the server the pid file names, and wait for it to go
// (it removes its own pid file on the way out). Says what happened either
// way, and resolves to the script's exit code: 0 once nothing runs here.
export async function stopServer(file = PID_FILE, timeout = 5000): Promise<number> {
  if (!file) {
    console.log("No pid file is configured (DUCKDOWN_PID is empty), so there's nothing to stop.");
    return 0;
  }
  const pid = readPid(file);
  if (!pid) {
    console.log(`Nothing to stop: no server pid in ${file}.`);
    return 0;
  }
  if (!isAlive(pid)) {
    unlinkSync(file);
    console.log(`pid ${pid} wasn't running; removed the stale ${file}.`);
    return 0;
  }
  if (!isDuckie(pid)) {
    console.error(`pid ${pid} (from ${file}) isn't a duckdown server, so it was left alone. If the file is stale, delete it.`);
    return 1;
  }
  process.kill(pid, "SIGTERM");
  for (const start = Date.now(); isAlive(pid); await Bun.sleep(50)) {
    if (Date.now() - start > timeout) {
      console.error(`pid ${pid} didn't stop within ${timeout / 1000}s; it's still running.`);
      return 1;
    }
  }
  if (readPid(file) === pid) unlinkSync(file); // it left without tidying up
  console.log(`Stopped duckie (pid ${pid}).`);
  return 0;
}
