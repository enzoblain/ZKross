import { beforeAll,afterAll,expect,it,vi } from 'vitest'
import { createPublicClient,http,encodeFunctionData,erc20Abi,type Abi,type Address,type Hash,type Hex } from 'viem'
import { readFileSync } from 'node:fs'
import { fileURLToPath,pathToFileURL } from 'node:url'
import type { ProverWasm,Proved } from './zk/types'
const rpc='http://127.0.0.1:18545'
const enabled=process.env.ZKROSS_LOCAL_DEPLOY_TEST==='1'
const values=new Map<string,string>()
let account:Address
let client:ReturnType<typeof createPublicClient>
let module:typeof import('./sepolia-deployment')
async function request({method,params}:{method:string;params?:unknown[]}){
 const response=await fetch(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:params??[]})})
 const data=await response.json();if(data.error)throw new Error(data.error.message);return data.result
}
beforeAll(async()=>{
 if(!enabled)return
 vi.stubEnv('VITE_SEPOLIA_RPC_URL',rpc);vi.resetModules()
 account=(await request({method:'eth_accounts'}))[0]
 await request({method:'anvil_setCode',params:['0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238','0x00']})
 await request({method:'anvil_setCode',params:['0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA','0x00']})
 vi.stubGlobal('window',{crypto:globalThis.crypto,localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)},ethereum:{request}})
 client=createPublicClient({transport:http(rpc)})
 module=await import('./sepolia-deployment')
},30_000)
afterAll(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
it.skipIf(!enabled)('deploys the real linked contracts and resumes by validated receipts on a LOCAL chain',async()=>{
 const journal=await module.deploySepoliaPrivatePool(account,()=>{})
 for(const name of module.deploymentOrder){expect(journal.steps[name]?.address).toBeTruthy();expect(await client.getBytecode({address:journal.steps[name]!.address!})).not.toBe('0x')}
 const initial=module.loadDeployment(account)
 const resumed=await module.deploySepoliaPrivatePool(account,()=>{})
 for(const name of module.deploymentOrder)expect(resumed.steps[name]?.hash).toBe(initial.steps[name]?.hash)
},60_000)
it.skipIf(!enabled)('recovers an uncertain response without issuing another creation',async()=>{
 const journal=module.loadDeployment(account)
 const previous=journal.steps.Poseidon2!
 const originalHash=previous.hash!
 delete previous.hash;delete previous.address;previous.pending=true
 values.set(`zkross:deployment:sepolia:v1:${account.toLowerCase()}`,JSON.stringify(journal))
 await expect(module.deploySepoliaPrivatePool(account,()=>{})).rejects.toThrow('uncertain')
 await expect(module.recoverDeployment(account,'Poseidon2',journal.steps.PrivateUsdcPool!.hash as Hash)).rejects.toThrow('match')
 await module.recoverDeployment(account,'Poseidon2',originalHash)
 const recovered=await module.deploySepoliaPrivatePool(account,()=>{})
 expect(recovered.steps.Poseidon2?.hash).toBe(originalHash)
},60_000)

it.skipIf(!enabled)('conserves actual token balances through a real WASM proof deposit and withdrawal, and rejects replay on LOCAL contracts',async()=>{
 const base=fileURLToPath(new URL('../../../../',import.meta.url))
 const mock=JSON.parse(readFileSync(base+'contracts/ethereum/out/MockUSDC.sol/MockUSDC.json','utf8'))
 const created=await request({method:'eth_sendTransaction',params:[{from:account,data:mock.bytecode.object,gas:'0x989680'}]})
 const receipt=await client.waitForTransactionReceipt({hash:created})
 const runtime=await client.getBytecode({address:receipt.contractAddress!})
 const token='0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address
 await request({method:'anvil_setCode',params:[token,runtime]})
 const journal=module.loadDeployment(account),pool=journal.steps.PrivateUsdcPool!.address!
 await (await import('./private-ethereum')).assertEthereumPrivatePool(pool)
 const artifact=(await import('./deployment-artifacts.json')).default.PrivateUsdcPool
 const abi=artifact.abi as Abi
 async function send(to:Address,contractAbi:Abi,functionName:string,args:readonly unknown[]){
  const data=encodeFunctionData({abi:contractAbi,functionName,args})
  const hash=await request({method:'eth_sendTransaction',params:[{from:account,to,data,gas:'0x989680'}]}) as Hash
  const result=await client.waitForTransactionReceipt({hash});expect(result.status).toBe('success');return result
 }
 const startingBalance=await client.readContract({address:token,abi:erc20Abi,functionName:'balanceOf',args:[account]})
 await send(token,mock.abi,'mint',[account,100n]);await send(token,erc20Abi,'approve',[pool,100n])
 // Proofs run in a Web Worker, where window is absent.
 vi.stubGlobal('window',undefined)
 const files=fileURLToPath(new URL('../../public/zk/',import.meta.url))
 const wasm=await import(/* @vite-ignore */pathToFileURL(files+'zkross_prover_wasm.js').href) as ProverWasm
 await wasm.default({module_or_path:readFileSync(files+'zkross_prover_wasm_bg.wasm')})
 const key=readFileSync(files+'policy_tx_2_2_proving_key.bin'),graph=readFileSync(files+'policy_tx_2_2.graph.bin'),r1cs=readFileSync(files+'policy_tx_2_2.r1cs')
 const {ethereumPrivateProof}=await import('./private-proof')
 const field=(n:bigint)=>('0x'+n.toString(16).padStart(64,'0')) as Hex
 const pk=JSON.parse(wasm.pubkey('11')).public_key??JSON.parse(wasm.pubkey('11')).pk
 const pk2=JSON.parse(wasm.pubkey('12')).public_key??JSON.parse(wasm.pubkey('12')).pk
 const ext={recipient:account,extAmount:100n,encryptedOutput0:'0x1234',encryptedOutput1:'0x'}
 const extHash=await client.readContract({address:pool,abi,functionName:'hashExtData',args:[ext]})
 const root=await client.readContract({address:pool,abi,functionName:'getRoot'}) as bigint
 const req={levels:20,leaves:[],deposit_root:field(root),ext_data_hash:extHash,public_amount:'100',inputs:[{leaf_index:null,sk:'2',amount:'0',blinding:'3'},{leaf_index:null,sk:'4',amount:'0',blinding:'5'}],outputs:[{pk,amount:'100',blinding:'13'},{pk:pk2,amount:'0',blinding:'14'}]}
 const built=JSON.parse(wasm.buildPrivateTransact(JSON.stringify(req)))
 let deposit:Proved;try{deposit=JSON.parse(wasm.prove(JSON.stringify(built),key,graph,r1cs))}catch(e){throw new Error('Deposit proof: '+String(e),{cause:e})}
 await send(pool,abi,'transact',[ethereumPrivateProof(deposit),ext])
 expect(await client.readContract({address:token,abi:erc20Abi,functionName:'balanceOf',args:[pool]})).toBe(100n)
 const out={recipient:account,extAmount:-40n,encryptedOutput0:'0x5678',encryptedOutput1:'0x'}
 const hash=await client.readContract({address:pool,abi,functionName:'hashExtData',args:[out]})
 const withdraw={levels:20,leaves:built.commitments,ext_data_hash:hash,public_amount:field(21888242871839275222246405745257275088548364400416034343698204186575808495617n-40n),inputs:[{leaf_index:0,sk:'11',amount:'100',blinding:'13'},{leaf_index:null,sk:'15',amount:'0',blinding:'16'}],outputs:[{pk,amount:'60',blinding:'17'},{pk:pk2,amount:'0',blinding:'18'}]}
 const spending=JSON.parse(wasm.buildPrivateTransact(JSON.stringify(withdraw)))
 let proof:Proved;try{proof=JSON.parse(wasm.prove(JSON.stringify(spending),key,graph,r1cs))}catch(e){throw new Error('Withdrawal proof: '+String(e),{cause:e})}
 await send(pool,abi,'transact',[ethereumPrivateProof(proof),out])
 expect(await client.readContract({address:token,abi:erc20Abi,functionName:'balanceOf',args:[pool]})).toBe(60n)
 expect(await client.readContract({address:token,abi:erc20Abi,functionName:'balanceOf',args:[account]})).toBe(startingBalance+40n)
 await expect(client.simulateContract({account,address:pool,abi,functionName:'transact',args:[ethereumPrivateProof(proof),out]})).rejects.toThrow()
},120_000)
