import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath,pathToFileURL } from 'node:url'
import { expect,it } from 'vitest'
import type { ProverWasm } from './types'
const base=fileURLToPath(new URL('../../../public/zk/',import.meta.url))
const files=['zkross_prover_wasm.js','zkross_prover_wasm_bg.wasm','policy_tx_2_2_proving_key.bin','policy_tx_2_2.graph.bin','policy_tx_2_2.r1cs']
it.skipIf(!files.every(file=>existsSync(base+file)))('generates and verifies a real non-GVK proof in the WASM engine',async()=>{
 const wasm=await import(/* @vite-ignore */ pathToFileURL(base+files[0]).href) as ProverWasm
 await wasm.default({module_or_path:readFileSync(base+files[1])})
 const request={levels:20,leaves:[],ext_data_hash:'1',public_amount:'100',inputs:[{leaf_index:null,sk:'2',amount:'0',blinding:'3'},{leaf_index:null,sk:'4',amount:'0',blinding:'5'}],outputs:[{pk:'6',amount:'60',blinding:'7'},{pk:'8',amount:'40',blinding:'9'}]}
 const built=JSON.parse(wasm.buildPrivateTransact(JSON.stringify(request)))
 expect(built.circuit).toBe('policy_tx_2_2');expect(built.inputs).not.toHaveProperty('D')
 const proof=JSON.parse(wasm.prove(JSON.stringify(built),readFileSync(base+files[2]),readFileSync(base+files[3]),readFileSync(base+files[4])))
 expect(proof.public_signals).toHaveLength(7);expect(proof.words).toHaveLength(8)
 // Value creation must fail the circuit, even if the input builder accepts the request.
 request.outputs[0].amount='61'
 const invalid=wasm.buildPrivateTransact(JSON.stringify(request))
 expect(()=>wasm.prove(invalid,readFileSync(base+files[2]),readFileSync(base+files[3]),readFileSync(base+files[4]))).toThrow()
},60_000)
