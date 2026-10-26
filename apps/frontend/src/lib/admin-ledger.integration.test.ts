// Live check of the Admin page's data path against both testnets. Runs only
// with ZKROSS_GVK_PRIV (from the repo's .env, passed at run time; never
// printed) and ZKROSS_E2E_STATE (deploy-out/e2e-state.json):
//   ZKROSS_GVK_PRIV=... ZKROSS_E2E_STATE=... npx vitest run admin-ledger.integration
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { type AdminZk, balances, decryptLedger, loadLedger } from './admin-ledger'
import { formatMessage, formatNote } from './amounts'
import { pools } from './pools'
import type { ProverWasm } from './zk/types'

const key = process.env.ZKROSS_GVK_PRIV
const statePath = process.env.ZKROSS_E2E_STATE
const enabled = Boolean(key && statePath && existsSync(statePath))
const zkDir = new URL('../../public/zk/', import.meta.url)

describe('Admin ledger on the live testnets', () => {
  it.skipIf(!enabled)('finds the end-to-end transfers with the right amounts and links', async () => {
    const wasm = (await import(/* @vite-ignore */ pathToFileURL(fileURLToPath(new URL('zkross_prover_wasm.js', zkDir))).href)) as ProverWasm
    await wasm.default({ module_or_path: readFileSync(fileURLToPath(new URL('zkross_prover_wasm_bg.wasm', zkDir))) })
    const zk: AdminZk = {
      decrypt: async (d, ciphertexts) => JSON.parse(wasm.decrypt(JSON.stringify({ d_priv: d, ciphertexts }))),
      bridgeMessage: async (req) => JSON.parse(wasm.bridgeMessage(JSON.stringify(req))),
    }
    const D = JSON.parse(wasm.adminKey(key!)) as { x: string; y: string }
    for (const network of ['stellar', 'ethereum'] as const) {
      const [x, y] = await pools[network].adminViewKey()
      expect(BigInt(x) === BigInt(D.x) && BigInt(y) === BigInt(D.y), `${network} view key`).toBe(true)
    }

    const ledger = await loadLedger()
    const rows = await decryptLedger(ledger, key!, zk)
    const bad = rows.filter((r) => [...r.outputs, ...r.inputs, r.bridge?.refund ?? null].some((n) => n && !n.matches) || r.bridge?.messageMatches === false)
    expect(bad.map((r) => r.tx.hash)).toEqual([])
    expect(rows.flatMap((r) => [...r.outputs, ...r.inputs]).filter((n) => n === null)).toHaveLength(0)

    const state = JSON.parse(readFileSync(statePath!, 'utf8'))
    // Every bridge message of the end-to-end script is linked to its claim.
    for (const name of ['bridgeOutStellar0', 'bridgeOutStellar1', 'bridgeOutSepolia0', 'bridgeOutSepolia1']) {
      const msg = state.steps[name].msg
      const row = rows.find((r) => r.tx.bridgeOut?.message === BigInt(msg.c))
      expect(row?.linkedTo, name).toBeDefined()
      expect(row?.bridge?.amount, name).toBe(BigInt(msg.amount))
    }
    // Withdrawals to the fresh addresses carry the exact public amounts.
    const withdrawals = rows.filter((r) => r.tx.kind === 'withdraw')
    for (const [i, fresh] of (state.freshEth as string[]).entries()) {
      const w = withdrawals.find((r) => r.tx.counterparty?.toLowerCase() === fresh.toLowerCase())
      expect(w?.tx.publicAmount, fresh).toBe(i === 0 ? -2000000n : -1000000n)
    }

    const poolUsdc = { stellar: await pools.stellar.poolUsdcBalance(), ethereum: await pools.ethereum.poolUsdcBalance() }
    for (const b of balances(rows, poolUsdc)) {
      expect(b.userNotes + b.pending + b.reserve).toBe(b.poolUsdc)
      console.log(`${b.network}: pool ${formatNote(b.network, b.poolUsdc)} = notes ${formatNote(b.network, b.userNotes)} (${b.noteCount}) + pending ${formatNote(b.network, b.pending)} + reserve ${formatNote(b.network, b.reserve)}`)
    }

    // The browser test (Stellar GBZA…P3BE, MetaMask 0x4cDE…A0D2).
    const mine = rows.filter((r) => /^GBZA.*P3BE$/.test(r.tx.sender) || /^0x4cde.*a0d2$/i.test(r.tx.sender))
    for (const r of mine) {
      const n = r.tx.network
      const created = r.outputs.filter((x) => x && x.amount > 0n).map((x) => formatNote(n, x!.amount))
      console.log(
        `${new Date(r.tx.time).toISOString()} ${n} ${r.tx.kind} ${r.tx.sender.slice(0, 6)}…`,
        r.tx.publicAmount ? `public ${formatNote(n, r.tx.publicAmount)}` : '',
        r.bridge ? `bridges ${formatMessage(r.bridge.amount)} ${r.linkId ?? 'unclaimed'}` : '',
        created.length ? `notes ${created.join('+')}` : '',
        r.linkId && !r.bridge ? `claims ${r.linkId}` : '',
      )
    }
    console.log(`${rows.length} transactions, ${rows.filter((r) => r.linkId).length / 2} bridge pairs linked`)
  }, 300_000)
})
