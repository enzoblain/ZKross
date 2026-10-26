import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { type AdminZk, type LedgerTx, adminCsv, balances, decryptLedger } from './admin-ledger'
import { ciphertext } from './zk/proof-args'
import type { BuiltTransact, Hex, ProverWasm, Proved } from './zk/types'

const zkDir = new URL('../../public/zk/', import.meta.url)
const file = (name: string) => readFileSync(fileURLToPath(new URL(name, zkDir)))
const hasStagedWasm = existsSync(fileURLToPath(new URL('zkross_prover_wasm.js', zkDir)))

const loadWasm = async () => {
  const wasm = (await import(/* @vite-ignore */ pathToFileURL(fileURLToPath(new URL('zkross_prover_wasm.js', zkDir))).href)) as ProverWasm
  await wasm.default({ module_or_path: file('zkross_prover_wasm_bg.wasm') })
  return wasm
}

const adapter = (wasm: ProverWasm): AdminZk => ({
  decrypt: async (d, ciphertexts) => JSON.parse(wasm.decrypt(JSON.stringify({ d_priv: d, ciphertexts }))),
  bridgeMessage: async (req) => JSON.parse(wasm.bridgeMessage(JSON.stringify(req))),
})

// A fresh random scalar per run: no key, real or test, is written anywhere.
const randomScalar = (): Hex =>
  `0x${Array.from(crypto.getRandomValues(new Uint8Array(31)), (b) => b.toString(16).padStart(2, '0')).join('')}`

const tx = (patch: Partial<LedgerTx>): LedgerTx => ({
  network: 'stellar',
  hash: 'h',
  time: 0,
  kind: 'transfer',
  sender: '',
  publicAmount: 0n,
  commitments: [],
  nullifiers: [],
  ...patch,
})

describe('admin decryption with the browser WASM prover', () => {
  it.skipIf(!hasStagedWasm)('decrypts a real proof’s notes, flags tampering and refuses a wrong key', async () => {
    const wasm = await loadWasm()
    const d = randomScalar()
    const D = JSON.parse(wasm.adminKey(d)) as { x: Hex; y: Hex }
    const pk = (JSON.parse(wasm.pubkey(randomScalar())) as { pk: Hex }).pk
    const dummy = () => ({ leaf_index: null, sk: randomScalar(), amount: '0', blinding: randomScalar() })
    const built = JSON.parse(
      wasm.buildTransact(
        JSON.stringify({
          levels: 20, leaves: [], d: [D.x, D.y], ext_data_hash: '0x05', public_amount: '30000000',
          inputs: [dummy(), dummy()],
          outputs: [{ pk, amount: '30000000', blinding: randomScalar() }, { pk, amount: '0', blinding: randomScalar() }],
          in_salts: [randomScalar(), randomScalar()], out_salts: [randomScalar(), randomScalar()],
        }),
      ),
    ) as BuiltTransact
    const c = built.circuit
    const proved = JSON.parse(
      wasm.prove(JSON.stringify(built), file(`${c}_proving_key.bin`), file(`${c}.graph.bin`), file(`${c}.r1cs`)),
    ) as Proved
    const s = proved.public_signals
    const deposit = tx({
      kind: 'deposit',
      publicAmount: 30000000n,
      commitments: built.commitments.map((cm, i) => ({ index: i, commitment: BigInt(cm), ct: ciphertext(s, 2 + i, 4) })),
      nullifiers: built.nullifiers.map((n, i) => ({ nullifier: BigInt(n), ct: ciphertext(s, i, 4) })),
    })

    const [row] = await decryptLedger([deposit], d, adapter(wasm))
    expect(row.outputs.map((n) => n?.amount)).toEqual([30000000n, 0n])
    expect(row.outputs.every((n) => n?.matches && BigInt(n.pk) === BigInt(pk))).toBe(true)
    expect(row.inputs.map((n) => n?.amount)).toEqual([0n, 0n])

    const tampered = { ...deposit, commitments: deposit.commitments.map((x, i) => (i === 0 ? { ...x, commitment: x.commitment + 1n } : x)) }
    expect((await decryptLedger([tampered], d, adapter(wasm)))[0].outputs[0]?.matches).toBe(false)

    const wrong = (await decryptLedger([deposit], randomScalar(), adapter(wasm)))[0]
    expect(wrong.outputs.some((n) => n?.matches)).toBe(false)
  }, 120_000)
})

describe('admin ledger links and balances', () => {
  it('links a bridge_out to its bridge_in, splits balances and exports CSV', async () => {
    const ct = (k: number) => ({ r: { x: BigInt(k), y: 1n }, c1: 1n, c2: 2n, c3: 3n })
    // Stub decryption keyed by the ciphertext's R.x.
    const plain: Record<string, { pk: Hex; amount: string; blinding: Hex; commitment: Hex }> = {
      '0x0000000000000000000000000000000000000000000000000000000000000001': { pk: '0x0a', amount: '40000000', blinding: '0x01', commitment: '0x0000000000000000000000000000000000000000000000000000000000000064' },
      '0x0000000000000000000000000000000000000000000000000000000000000002': { pk: '0x0a', amount: '40000000', blinding: '0x01', commitment: '0x0000000000000000000000000000000000000000000000000000000000000064' },
      '0x0000000000000000000000000000000000000000000000000000000000000003': { pk: '0x0a', amount: '20000000', blinding: '0x02', commitment: '0x0000000000000000000000000000000000000000000000000000000000000065' },
      '0x0000000000000000000000000000000000000000000000000000000000000004': { pk: '0x0b', amount: '2000000', blinding: '0x09', commitment: '0x00' },
      '0x0000000000000000000000000000000000000000000000000000000000000005': { pk: '0x0a', amount: '20000000', blinding: '0x03', commitment: '0x0000000000000000000000000000000000000000000000000000000000000066' },
      '0x0000000000000000000000000000000000000000000000000000000000000006': { pk: '0x0b', amount: '2000000', blinding: '0x04', commitment: '0x0000000000000000000000000000000000000000000000000000000000000067' },
    }
    const zk: AdminZk = {
      decrypt: async (_d, cts) => ({ notes: cts.map((c) => plain[c.rx]) }),
      bridgeMessage: async () => ({ bridge_message: '0x00000000000000000000000000000000000000000000000000000000000000c0', claim_nullifier: '0x00000000000000000000000000000000000000000000000000000000000000cc' }),
    }
    const rows = await decryptLedger(
      [
        tx({ hash: 'dep', kind: 'deposit', publicAmount: 40000000n, commitments: [{ index: 0, commitment: 100n, ct: ct(1) }] }),
        tx({
          hash: 'out', kind: 'bridgeOut',
          nullifiers: [{ nullifier: 7n, ct: ct(2) }],
          commitments: [{ index: 2, commitment: 101n, ct: ct(3) }],
          bridgeOut: { message: 0xc0n, deadline: 1n, refundCommitment: 102n, ct: ct(4), refundCt: ct(5) },
        }),
        tx({ network: 'ethereum', hash: 'in', kind: 'bridgeIn', claimNullifier: 0xccn, commitments: [{ index: 0, commitment: 103n, ct: ct(6) }] }),
      ],
      'unused',
      zk,
    )
    expect(rows[1].bridge).toMatchObject({ amount: 2000000n, messageMatches: true })
    expect(rows[1].bridge?.refund?.matches).toBe(true)
    expect(rows[1].linkId).toBe('B1')
    expect(rows[2].linkedTo).toEqual({ network: 'stellar', hash: 'out' })

    const [s, e] = balances(rows, { stellar: 220000000n, ethereum: 25000000n })
    // Stellar: the 4 USDC note is spent, 2 USDC of change is live, the message is claimed.
    expect(s).toMatchObject({ userNotes: 20000000n, noteCount: 1, pending: 0n, reserve: 200000000n })
    expect(e).toMatchObject({ userNotes: 2000000n, reserve: 23000000n })

    const csv = adminCsv(rows).split('\n')
    expect(csv).toHaveLength(4)
    expect(csv[2]).toContain('bridgeOut')
    expect(csv[2]).toContain('B1')
    expect(csv.every((l) => !l.includes('MISMATCH'))).toBe(true)
  })
})
