import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { ProverWasm } from './types'

const wasmJs = fileURLToPath(new URL('../../../public/zk/zkross_prover_wasm.js', import.meta.url))
const wasmBinary = fileURLToPath(new URL('../../../public/zk/zkross_prover_wasm_bg.wasm', import.meta.url))
const vectorsPath = fileURLToPath(
  new URL('../../../../../contracts/ethereum/test/fixtures/spec_vectors.json', import.meta.url),
)
const hasStagedWasm = existsSync(wasmJs) && existsSync(wasmBinary)

type BridgeVector = {
  C: string
  amount: number
  asset_id: number
  claim_nullifier: string
  claim_secret: string
  deadline_bucket: string
  dst_chain: string
  outbox_root_after_insert: string
  recipient_pk: string
  refund_blinding: string
  refund_commitment: string
  refund_pk: string
  refund_value: number
  src_chain: string
}

describe('Poseidon2 through the browser WASM prover', () => {
  it.skipIf(!hasStagedWasm)(
    'matches SPEC.md vectors (skipped until scripts/build/sync-frontend.sh stages public/zk)',
    async () => {
      const wasm = await import(/* @vite-ignore */ pathToFileURL(wasmJs).href) as ProverWasm
      await wasm.default({ module_or_path: readFileSync(wasmBinary) })
      const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')) as { bridge_messages: BridgeVector[] }

      for (const vector of vectors.bridge_messages) {
        const commitment = JSON.parse(
          wasm.commitment(String(vector.refund_value), vector.refund_pk, vector.refund_blinding),
        ) as { commitment: string }
        expect(commitment.commitment).toBe(vector.refund_commitment)

        const message = JSON.parse(wasm.bridgeMessage(JSON.stringify({
          amount: String(vector.amount),
          asset_id: String(vector.asset_id),
          src_chain: vector.src_chain,
          dst_chain: vector.dst_chain,
          recipient_pk: vector.recipient_pk,
          claim_secret: vector.claim_secret,
          deadline_bucket: vector.deadline_bucket,
        }))) as { bridge_message: string; claim_nullifier: string }
        expect(message.bridge_message).toBe(vector.C)
        expect(message.claim_nullifier).toBe(vector.claim_nullifier)

        const root = JSON.parse(wasm.treeRoot(JSON.stringify({
          levels: 20,
          leaves: [vector.C, `0x${'00'.repeat(32)}`],
        }))) as { root: string }
        expect(root.root).toBe(vector.outbox_root_after_insert)
      }
    },
  )
})
