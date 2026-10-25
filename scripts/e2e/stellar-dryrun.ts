// Simulates (never sends) alice's 3 USDC deposit on the live Stellar testnet
// pool with a real proof. transact verifies the proof before it moves any
// token, so with an unfunded alice the simulation must fail at the USDC
// transfer, not with a pool error: that shows the CLI argument encoding, the
// ext-data hash and the on-chain Groth16 verification all work.
import { deployments, need } from "../../services/bridge/src/lib/config.ts";
import * as zk from "../../services/bridge/src/lib/prover.ts";
import * as st from "../../services/bridge/src/lib/stellar.ts";

const S = deployments.stellarTestnet.zkross;
const D = zk.adminKey(need("ZKROSS_GVK_PRIV"));
const sk = zk.randomField();
const pk = zk.pubkey(sk);
const ext = { recipient: S.pool, ext_amount: "30000000", encrypted_output0: "01", encrypted_output1: "02" };
const extHash = st.view(S.pool, "hash_ext_data", { ext_data: ext });
const dummy = () => ({ leaf_index: null, sk: zk.randomField(), amount: "0", blinding: zk.randomField() });
const built = zk.buildTransact({
  levels: 20,
  leaves: st.noteLeaves(await st.events(S.pool, S.deployLedger)),
  d: [D.x, D.y],
  ext_data_hash: `0x${extHash}`,
  public_amount: "30000000",
  inputs: [dummy(), dummy()],
  outputs: [
    { pk, amount: "30000000", blinding: zk.randomField() },
    { pk, amount: "0", blinding: zk.randomField() },
  ],
  in_salts: [zk.randomField(), zk.randomField()],
  out_salts: [zk.randomField(), zk.randomField()],
});
console.log(`root matches the pool: ${built.root === st.hex32(st.view(S.pool, "get_root"))}`);
try {
  st.invoke("zkross-alice", S.pool, "transact", { proof: st.transactProof(zk.prove(built)), ext_data: ext, sender: need("STELLAR_ALICE_ADDRESS") }, false);
  console.log("simulation succeeded (alice must already hold USDC)");
} catch (e) {
  console.log((e as Error).message);
}
