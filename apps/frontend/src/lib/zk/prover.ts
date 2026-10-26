// The browser prover: zkross-prover's builders, hashes and Groth16 prover in
// a Web Worker, with the same JSON requests as the CLI the scripts use.
import type {
  BridgeInRequest,
  BridgeOutRequest,
  Built,
  BuiltBridgeIn,
  BuiltBridgeOut,
  BuiltTransact,
  Hex,
  ProverOp,
  Proved,
  TransactRequest,
  PrivateTransactRequest,
  WorkerResponse,
} from './types'

/** The BN254 scalar field size. */
export const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n

export const hex32 = (value: bigint): Hex => `0x${value.toString(16).padStart(64, '0')}`

/** A random field element (blindings, salts, claim secrets). */
export function randomField(): Hex {
  // Rejection sampling avoids modulo bias and excludes the invalid zero key.
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    let value = 0n
    for (const byte of bytes) value = (value << 8n) | BigInt(byte)
    if (value > 0n && value < R) return hex32(value)
  }
}

/** A negative public amount as a field element (withdrawals). */
export const fieldNeg = (value: bigint): Hex => hex32((R - value) % R)

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, { resolve: (out: string) => void; reject: (error: Error) => void }>()

function call(op: ProverOp, ...args: string[]): Promise<string> {
  if (!worker) {
    worker = new Worker(new URL('./prover-worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      const entry = pending.get(response.id)
      if (!entry) return
      pending.delete(response.id)
      if (response.ok) entry.resolve(response.out)
      else entry.reject(new Error(response.error))
    }
  }
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker!.postMessage({ id, op, args })
  })
}

const json = async <T>(op: ProverOp, ...args: string[]): Promise<T> =>
  JSON.parse(await call(op, ...args)) as T

export const prover = {
  buildPrivateTransact: (req: PrivateTransactRequest) => json<BuiltTransact>('buildPrivateTransact', JSON.stringify(req)),
  buildTransact: (req: TransactRequest) => json<BuiltTransact>('buildTransact', JSON.stringify(req)),
  buildBridgeOut: (req: BridgeOutRequest) => json<BuiltBridgeOut>('buildBridgeOut', JSON.stringify(req)),
  buildBridgeIn: (req: BridgeInRequest) => json<BuiltBridgeIn>('buildBridgeIn', JSON.stringify(req)),
  /** Proves in the worker (about 10 to 30 seconds). */
  prove: (built: Built) => json<Proved>('prove', JSON.stringify(built)),
  pubkey: async (sk: Hex) => (await json<{ pk: Hex }>('pubkey', sk)).pk,
  commitment: async (amount: bigint, pk: Hex, blinding: Hex) =>
    (await json<{ commitment: Hex }>('commitment', amount.toString(), pk, blinding)).commitment,
  treeRoot: async (leaves: Hex[]) =>
    (await json<{ root: Hex }>('treeRoot', JSON.stringify({ levels: 20, leaves }))).root,
}
