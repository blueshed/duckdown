#!/usr/bin/env bun
// bun run stop: stop the server this folder's pid file names (DUCKDOWN_PID,
// else ./duckdown.pid). The work is stopServer() in pid.ts.
import { stopServer } from "./pid";

if (import.meta.main) process.exit(await stopServer());
