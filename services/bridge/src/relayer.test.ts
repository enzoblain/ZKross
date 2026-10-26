// Offline checks of the relayer's allowlist and HTTP protections.
//   node --import tsx --test src/relayer.test.ts
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

// Before the config loads, so the relayer sees it.
process.env.ZKROSS_RELAYER_RATE = "5";
const { deployments } = await import("./lib/config.ts");
const { startRelayer, validate } = await import("./relayer.ts");

const S = deployments.stellarTestnet.zkross.pool;
const E = deployments.sepolia.zkross.pool;
const stellarArgs = (ext_amount: string) => ({ proof: {}, ext_data: { recipient: "G", ext_amount, encrypted_output0: "01", encrypted_output1: "02" } });
const ethArgs = (extAmount: string) => ({ proof: {}, extData: { recipient: "0x0", extAmount, encryptedOutput0: "0x01", encryptedOutput1: "0x02" } });

test("relays withdrawals, transfers and bridge calls to our pools only", () => {
  assert.doesNotThrow(() => validate({ chain: "stellar", pool: S, fn: "transact", args: stellarArgs("-5000000") }));
  assert.doesNotThrow(() => validate({ chain: "stellar", pool: S, fn: "transact", args: stellarArgs("0") }));
  assert.doesNotThrow(() => validate({ chain: "stellar", pool: S, fn: "bridge_out", args: { proof: {}, ext_data: {} } }));
  assert.doesNotThrow(() => validate({ chain: "sepolia", pool: E.toLowerCase(), fn: "transact", args: ethArgs("-500000") }));
  assert.doesNotThrow(() => validate({ chain: "sepolia", pool: E, fn: "bridgeIn", args: { proof: {}, extData: {} } }));
});

test("refuses deposits, other functions, other contracts and extra arguments", () => {
  const refused = (body: unknown, why: RegExp) => assert.throws(() => validate(body), why);
  refused({ chain: "stellar", pool: S, fn: "transact", args: stellarArgs("10") }, /deposits/);
  refused({ chain: "sepolia", pool: E, fn: "transact", args: ethArgs("1") }, /deposits/);
  refused({ chain: "stellar", pool: S, fn: "add_liquidity", args: stellarArgs("0") }, /not relayed/);
  refused({ chain: "sepolia", pool: E, fn: "postRemoteRoot", args: ethArgs("0") }, /not relayed/);
  refused({ chain: "stellar", pool: deployments.stellarTestnet.usdc.sac, fn: "transact", args: stellarArgs("0") }, /not a ZKross pool/);
  refused({ chain: "sepolia", pool: deployments.sepolia.usdc.address, fn: "bridgeIn", args: ethArgs("0") }, /not a ZKross pool/);
  refused({ chain: "stellar", pool: S, fn: "bridge_in", args: { proof: {}, ext_data: {}, sender: "G" } }, /expected args/);
  refused({ chain: "mainnet", pool: S, fn: "transact", args: stellarArgs("0") }, /chain/);
  refused({ chain: "stellar", pool: S, fn: "transact", args: stellarArgs("x") }, /bad external amount/);
});

let base = "";
let server: ReturnType<typeof startRelayer>;
before(async () => {
  server = startRelayer(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test("CORS allows the site only, and the rate limit applies per IP", async () => {
  const bad = await fetch(`${base}/health`, { headers: { origin: "https://evil.example" } });
  assert.equal(bad.status, 403);
  const ok = await fetch(`${base}/health`, { headers: { origin: "http://127.0.0.1:5173" } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("access-control-allow-origin"), "http://127.0.0.1:5173");
  assert.deepEqual(await ok.json(), { ok: true, fee: "0" });
  const refused = await fetch(`${base}/relay`, { method: "POST", body: JSON.stringify({ chain: "stellar", pool: S, fn: "add_liquidity", args: stellarArgs("0") }) });
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).error, /not relayed/);
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await fetch(`${base}/health`)).status);
  assert.ok(codes.includes(429), `expected a 429 after the limit, got ${codes}`);
});
