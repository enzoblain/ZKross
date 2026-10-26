// The bridge service: the root poster loop and the relayer's HTTP server in
// one process.
//   tsx src/service.ts                   both
//   tsx src/service.ts --only=relayer    the relayer only
//   tsx src/service.ts --only=root-poster
import { startRelayer } from "./relayer.ts";
import { runRootPoster } from "./root-poster.ts";

const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
if (only && only !== "relayer" && only !== "root-poster") throw new Error("--only must be relayer or root-poster");
if (only !== "root-poster") startRelayer();
if (only !== "relayer") await runRootPoster();
