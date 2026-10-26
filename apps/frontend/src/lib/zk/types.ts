// Types shared by the prover client, its worker and the tests. The JSON shapes
// are zkross-prover's (prover/src/lib.rs): fields are 32-byte 0x-hex strings.
export type Hex = `0x${string}`

/** The wasm-bindgen module built from prover/wasm. */
export type ProverWasm = {
  default: (init: { module_or_path: string | URL | BufferSource }) => Promise<unknown>
  buildTransact: (req: string) => string
  buildPrivateTransact: (req: string) => string
  buildBridgeOut: (req: string) => string
  buildBridgeIn: (req: string) => string
  prove: (req: string, pk: Uint8Array, graph: Uint8Array, r1cs: Uint8Array) => string
  pubkey: (sk: string) => string
  commitment: (amount: string, pk: string, blinding: string) => string
  bridgeMessage: (req: string) => string
  treeRoot: (req: string) => string
}

export type ProverOp = Exclude<keyof ProverWasm, 'default'>
export type WorkerRequest = { id: number; op: ProverOp; args: string[] }
export type WorkerResponse =
  | { id: number; ok: true; out: string }
  | { id: number; ok: false; error: string }

export type InNote = { leaf_index: number | null; sk: Hex; amount: string; blinding: Hex }
export type OutNote = { pk: Hex; amount: string; blinding: Hex }

export type SpendRequest = {
  levels: number
  leaves: Hex[]
  d: [Hex, Hex]
  ext_data_hash: Hex
  inputs: [InNote, InNote]
  outputs: [OutNote, OutNote]
  in_salts: [Hex, Hex]
  out_salts: [Hex, Hex]
}

export type TransactRequest = SpendRequest & { public_amount: string }
export type PrivateTransactRequest = Omit<TransactRequest, 'd' | 'in_salts' | 'out_salts'> & { deposit_root?: Hex }

export type BridgeOutRequest = SpendRequest & {
  amount: string
  scale: string
  asset_id: string
  src_chain: string
  dst_chain: string
  deadline_bucket: string
  recipient_pk: Hex
  claim_secret: Hex
  refund_pk: Hex
  refund_blinding: Hex
  refund_salt: Hex
  bridge_salt: Hex
}

export type BridgeInRequest = {
  levels: number
  outbox_leaves: Hex[]
  index: number
  d: [Hex, Hex]
  ext_data_hash: Hex
  amount: string
  scale: string
  asset_id: string
  src_chain: string
  dst_chain: string
  deadline_bucket: string
  recipient_sk: Hex
  claim_secret: Hex
  outputs: [{ amount: string; blinding: Hex }, { amount: string; blinding: Hex }]
  out_salts: [Hex, Hex]
}

export type Built = { circuit: string; inputs: Record<string, unknown> }
export type BuiltTransact = Built & { root: Hex; nullifiers: Hex[]; commitments: Hex[] }
export type BuiltBridgeOut = Built & {
  root: Hex
  nullifiers: Hex[]
  change_commitments: Hex[]
  bridge_message: Hex
  refund_commitment: Hex
  claim_nullifier: Hex
}
export type BuiltBridgeIn = Built & {
  remote_root: Hex
  bridge_message: Hex
  claim_nullifier: Hex
  commitments: Hex[]
  recipient_pk: Hex
}

/** A 256-byte proof (the EVM calldata words) and the public signals. */
export type Proved = { proof: Hex; words: Hex[]; public_signals: Hex[] }
