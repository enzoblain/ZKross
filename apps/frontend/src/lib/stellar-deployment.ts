import { Buffer } from 'buffer'
import { Address,Operation,nativeToScVal,scValToNative,xdr,rpc } from '@stellar/stellar-sdk'
import { bytesToHex,hexToBytes } from 'viem'
import artifacts from './stellar-artifacts.json'
import { submitStellarOperation,stellarRpc,assertStellarWallet } from './stellar-submit'
export const stellarDeploymentOrder=['asp_membership','asp_non_membership','circom_groth16_verifier','pool'] as const
export type StellarDeploymentName=typeof stellarDeploymentOrder[number]
type Step={salt:string;address?:string;uploadHash?:string;creationHash?:string}
export type StellarDeploymentJournal={version:1;source:string;steps:Partial<Record<StellarDeploymentName,Step>>}
const key=(source:string)=>`zkross:deployment:stellar:v1:${source}`
const running=new Set<string>()
export function loadStellarDeployment(source:string):StellarDeploymentJournal {
 const raw=window.localStorage.getItem(key(source));if(!raw)return {version:1,source,steps:{}}
 const saved=JSON.parse(raw) as StellarDeploymentJournal
 if(saved.version!==1||saved.source!==source)throw new Error('Invalid Stellar deployment journal.')
 return saved
}
const bytes=(hex:string)=>hexToBytes(`0x${hex}`)
export async function deployStellarPrivatePool(source:string,update:(journal:StellarDeploymentJournal)=>void){
 if(running.has(source))throw new Error('Stellar deployment is already running.')
 const journal=loadStellarDeployment(source);running.add(source)
 const save=()=>{window.localStorage.setItem(key(source),JSON.stringify(journal));update(structuredClone(journal))}
 try{
  await assertStellarWallet(source)
  for(const name of stellarDeploymentOrder){
   const step=journal.steps[name]??={salt:bytesToHex(crypto.getRandomValues(new Uint8Array(32))).slice(2)};save()
   const response=await fetch(`${import.meta.env.BASE_URL}zk/stellar/${name}.wasm`)
   if(!response.ok)throw new Error(`Missing Stellar artifact: ${name}`)
   const wasm=new Uint8Array(await response.arrayBuffer())
   const digest=bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256',wasm))).slice(2)
   if(digest!==artifacts[name])throw new Error('Stellar artifact hash does not match this build.')
   const uploaded=await submitStellarOperation(source,`deploy:${name}:upload:${digest}`,Operation.uploadContractWasm({wasm}),state=>{step.uploadHash=state.hash;save()})
   if(uploaded.status!==rpc.Api.GetTransactionStatus.SUCCESS||!uploaded.returnValue)throw new Error('Missing upload result.')
   if(bytesToHex(scValToNative(uploaded.returnValue) as Uint8Array).slice(2)!==digest)throw new Error('Upload result hash mismatch.')
   const address=(value:string)=>new Address(value).toScVal()
   let constructorArgs:xdr.ScVal[]=[]
   if(name==='asp_membership')constructorArgs=[address(source),nativeToScVal(20,{type:'u32'})]
   if(name==='asp_non_membership')constructorArgs=[address(source)]
   if(name==='pool')constructorArgs=[address(source),address('CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'),address(journal.steps.circom_groth16_verifier!.address!),address(journal.steps.asp_membership!.address!),address(journal.steps.asp_non_membership!.address!),xdr.ScVal.scvBytes(Buffer.from(bytes(artifacts.asp_membership))),xdr.ScVal.scvBytes(Buffer.from(bytes(artifacts.asp_non_membership))),nativeToScVal(1000000000000n,{type:'u256'}),nativeToScVal(20,{type:'u32'}),nativeToScVal(0,{type:'u32'}),nativeToScVal('zkross.note.v1',{type:'string'})]
   const created=await submitStellarOperation(source,`deploy:${name}:create:${step.salt}`,Operation.createCustomContract({address:new Address(source),wasmHash:bytes(digest),salt:bytes(step.salt),constructorArgs}),state=>{step.creationHash=state.hash;save()})
   if(created.status!==rpc.Api.GetTransactionStatus.SUCCESS||!created.returnValue)throw new Error('Missing contract creation result.')
   const contract=scValToNative(created.returnValue)
   if(typeof contract!=='string'||!contract.startsWith('C'))throw new Error('Invalid contract address result.')
   step.address=contract;save();await verifyStellarArtifact(contract,name)
  }
  return journal
 }finally{running.delete(source)}
}
export async function verifyStellarArtifact(address:string,name:StellarDeploymentName){
 const wasm=await stellarRpc.getContractWasmByContractId(address)
 const hash=bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(wasm)))).slice(2)
 if(hash!==artifacts[name])throw new Error(`Stellar ${name} code differs from the pinned private build.`)
}
