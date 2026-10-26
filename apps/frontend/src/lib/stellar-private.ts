import {contract,Contract,Address,nativeToScVal,Operation,rpc,scValToNative,xdr} from '@stellar/stellar-sdk'
import {bytesToHex,hexToBytes,type Hex} from 'viem'
import {stellarConfig} from './config'
import {stellarRpc,submitStellarOperation} from './stellar-submit'
import {verifyStellarArtifact} from './stellar-deployment'
import artifacts from './stellar-artifacts.json'
import {stellarPrivateProof} from './private-proof'
import type {Proved} from './zk/types'
export const stellarUsdc='CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'
type DynamicClient=contract.Client&Record<string,(args?:object)=>Promise<contract.AssembledTransaction<unknown>>>
const clients=new Map<string,Promise<DynamicClient>>()
export function stellarContract(address:string,source?:string){const key=address+':'+(source??'');let client=clients.get(key);if(!client){client=contract.Client.from({contractId:address,networkPassphrase:stellarConfig.passphrase,rpcUrl:stellarConfig.rpcUrl,...(source?{publicKey:source}:{})}) as Promise<DynamicClient>;clients.set(key,client)}return client}
export async function stellarView<T>(address:string,method:string,args:object={}):Promise<T>{const client=await stellarContract(address);const tx=await client[method](args);const result=tx.result as {unwrap?:()=>T}|undefined;return (typeof result?.unwrap==='function'?result.unwrap():result) as T}
export async function stellarCall(source:string,id:string,address:string,method:string,args:object,onHash?:(hash:string)=>void){
 const client=await stellarContract(address,source),operation=new Contract(address).call(method,...client.spec.funcArgsToScVals(method,args))
 return submitStellarOperation(source,id,operation,state=>onHash?.(state.hash))
}
export async function assertPrivateStellarPool(pool:string){
 await verifyStellarArtifact(pool,'pool')
 const [token,verifier,flags,paused]=await Promise.all([stellarView<string>(pool,'get_token'),stellarView<string>(pool,'get_verifier'),stellarView<number>(pool,'get_policy_flags'),stellarView<boolean>(pool,'deposits_paused')])
 if(token!==stellarUsdc||flags!==0)throw new Error('Le pool Stellar doit utiliser USDC officiel et le circuit ouvert sans GVK.')
 if(paused)throw new Error('Les dépôts SPP sont suspendus ; aucun nouveau burn ne doit être lancé.')
 await verifyStellarArtifact(verifier,'circom_groth16_verifier')
 if((await stellarRpc.getNetwork()).passphrase!==stellarConfig.passphrase)throw new Error('Le RPC Stellar ne pointe pas vers le testnet.')
}
export type StellarExt={recipient:string;ext_amount:string;encrypted_output0:Hex;encrypted_output1:Hex}
export const nativeExt=(ext:StellarExt)=>({...ext,ext_amount:BigInt(ext.ext_amount),encrypted_output0:hexToBytes(ext.encrypted_output0),encrypted_output1:hexToBytes(ext.encrypted_output1)})
export async function stellarExtHash(pool:string,ext:StellarExt):Promise<Hex>{return bytesToHex(await stellarView<Uint8Array>(pool,'external_data_hash',{ext:nativeExt(ext)}))}
export const stellarProofArgs=(proof:Proved)=>stellarPrivateProof(proof)
export async function uploadInbox(source:string){
 const name='batch_inbox',response=await fetch(`${import.meta.env.BASE_URL}zk/stellar/${name}.wasm`)
 if(!response.ok)throw new Error('Le binaire de l’inbox collective est absent.')
 const wasm=new Uint8Array(await response.arrayBuffer()),digest=bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256',wasm))).slice(2)
 if(digest!==artifacts.batch_inbox)throw new Error('Binaire inbox non conforme à cette version.')
 const result=await submitStellarOperation(source,`upload-inbox:${digest}`,Operation.uploadContractWasm({wasm}))
 if(result.status!==rpc.Api.GetTransactionStatus.SUCCESS||!result.returnValue||bytesToHex(scValToNative(result.returnValue) as Uint8Array).slice(2)!==digest)throw new Error('Publication inbox non confirmée.')
 return digest
}
export function configScVal(pool:string,manifest:Hex,members:{amount:string;commitment0:Hex;commitment1:Hex}[]):xdr.ScVal{
 const struct=(fields:Record<string,xdr.ScVal>)=>xdr.ScVal.scvMap(Object.entries(fields).sort(([a],[b])=>a.localeCompare(b)).map(([key,val])=>new xdr.ScMapEntry({key:nativeToScVal(key,{type:'symbol'}),val})))
 return struct({token:new Address(stellarUsdc).toScVal(),pool:new Address(pool).toScVal(),pool_hash:nativeToScVal(hexToBytes(`0x${artifacts.pool}`),{type:'bytes'}),manifest:nativeToScVal(hexToBytes(manifest),{type:'bytes'}),entries:xdr.ScVal.scvVec(members.map(m=>struct({amount:nativeToScVal(BigInt(m.amount),{type:'u64'}),commitment0:nativeToScVal(BigInt(m.commitment0),{type:'u256'}),commitment1:nativeToScVal(BigInt(m.commitment1),{type:'u256'})})))})
}
