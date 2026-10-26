/// <reference lib="webworker" />
// Runs zkross-prover (prover/wasm) off the main thread. The wasm module and
// the circuit files are served from public/zk, staged by
// scripts/build/sync-frontend.sh; they are fetched once and kept in memory.
import type { ProverWasm, WorkerRequest, WorkerResponse } from './types'

const base = `${import.meta.env.BASE_URL}zk/`
let wasm: Promise<ProverWasm> | null = null
const files = new Map<string, Promise<Uint8Array>>()

function loadWasm() {
  wasm ??= import(/* @vite-ignore */ `${base}zkross_prover_wasm.js`).then(async (module: ProverWasm) => {
    await module.default({ module_or_path: `${base}zkross_prover_wasm_bg.wasm` })
    return module
  })
  return wasm
}

function file(name: string) {
  let entry = files.get(name)
  if (!entry) {
    entry = fetch(`${base}${name}`).then(async (response) => {
      if (!response.ok) throw new Error(`${name} is missing: run scripts/build/sync-frontend.sh`)
      return new Uint8Array(await response.arrayBuffer())
    })
    files.set(name, entry)
  }
  return entry
}

async function handle({ op, args }: WorkerRequest): Promise<string> {
  const prover = await loadWasm()
  if (op === 'prove') {
    const circuit = (JSON.parse(args[0]) as { circuit: string }).circuit
    const [pk, graph, r1cs] = await Promise.all([
      file(`${circuit}_proving_key.bin`),
      file(`${circuit}.graph.bin`),
      file(`${circuit}.r1cs`),
    ])
    return prover.prove(args[0], pk, graph, r1cs)
  }
  const fn = prover[op] as ((...a: string[]) => string) | undefined
  // A site newer than its staged prover (public/zk built before this op existed).
  if (typeof fn !== 'function') {
    throw new Error(`The browser prover in public/zk is out of date (no ${op}): rebuild it with bash scripts/build/stage-zk.sh, then reload the page.`)
  }
  return fn(...args)
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id } = event.data
  let response: WorkerResponse
  try {
    response = { id, ok: true, out: await handle(event.data) }
  } catch (error) {
    response = { id, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  self.postMessage(response)
}
