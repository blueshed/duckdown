// The export alone, in a process of its own as a build runs it (n167): its
// time and the memory it peaked at, against DUCKDOWN_PATH. measure.ts times
// the export too, but in a process already holding everything it measured.
import { exportSite } from "../server/export";
const started = performance.now();
await exportSite({ out: process.argv[2]!, origin: "https://example.com", say: () => {} });
const ms = (performance.now() - started).toFixed(0);
const mb = (process.resourceUsage().maxRSS / 1024).toFixed(1);
console.log(`${"the export alone, as a build runs it".padEnd(46)} ${ms.padStart(7)} ms, peak ${mb} MB`);
