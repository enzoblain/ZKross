import { rpc,TransactionBuilder,BASE_FEE,type xdr, Transaction } from '@stellar/stellar-sdk'
import { getAddress,getNetworkDetails,signTransaction } from '@stellar/freighter-api'
import { bytesToHex } from 'viem'
import { stellarConfig } from './config'
export const stellarRpc=new rpc.Server(stellarConfig.rpcUrl)
export type StellarSubmission={source:string;id:string;hash:string;xdr:string;operation:string;status:'awaiting_signature'|'submitted'|'confirmed'|'failed';error?:string}
const running=new Set<string>()
const storageKey=(source:string,id:string)=>`zkross:stellar-submit:v1:${source}:${id}`
const hash=(tx:Transaction)=>bytesToHex(tx.hash()).slice(2)
export function stellarSubmission(source:string,id:string):StellarSubmission|undefined {
 const raw=window.localStorage.getItem(storageKey(source,id))
 if(!raw)return
 const data=JSON.parse(raw) as StellarSubmission
 if(data.source!==source||data.id!==id||!/^[0-9a-f]{64}$/.test(data.hash))throw new Error('Invalid saved Stellar submission.')
 return data
}
export function assertStellarEnvelope(state:StellarSubmission,operation:xdr.Operation){
 const transaction=TransactionBuilder.fromXDR(state.xdr,stellarConfig.passphrase)
 if(!(transaction instanceof Transaction))throw new Error('Unexpected fee-bump envelope in saved request.')
 if(transaction.source!==state.source||hash(transaction)!==state.hash)throw new Error('Saved Stellar envelope source or hash mismatch.')
 const envelope=transaction.toEnvelope()
 if(envelope.type!=='envelopeTypeTx'||envelope.v1.tx.operations.length!==1||envelope.v1.tx.operations[0].toXDR('base64')!==operation.toXDR('base64'))throw new Error('Saved Stellar envelope operation differs from the requested operation.')
 return transaction
}
export async function assertStellarWallet(source:string){
 const [network,address,rpcNetwork]=await Promise.all([getNetworkDetails(),getAddress(),stellarRpc.getNetwork()])
 if(network.error||network.networkPassphrase!==stellarConfig.passphrase||rpcNetwork.passphrase!==stellarConfig.passphrase)throw new Error('Freighter and RPC must both use Stellar Testnet.')
 if(address.error||address.address!==source)throw new Error('The connected Freighter account changed.')
}
/** Simulate before signature, bind the signed envelope to its saved hash, and
 * reuse that SAME envelope on retries. This function never creates a replacement
 * for an uncertain expired transaction. Stored XDR contains only public calls.
 */
export async function submitStellarOperation(source:string,id:string,operation:xdr.Operation,onUpdate?:(state:StellarSubmission)=>void){
 const key=storageKey(source,id)
 if(running.has(key))throw new Error('This Stellar operation is already running.')
 let state=stellarSubmission(source,id)
 running.add(key)
 const save=()=>{if(state){window.localStorage.setItem(key,JSON.stringify(state));onUpdate?.({...state})}}
 try{
  if(state && state.operation!==operation.toXDR('base64'))throw new Error('Saved Stellar request differs from the requested operation.')
  if(!state){
   await assertStellarWallet(source)
   const account=await stellarRpc.getAccount(source)
   const unsigned=new TransactionBuilder(account,{fee:BASE_FEE,networkPassphrase:stellarConfig.passphrase}).addOperation(operation).setTimeout(300).build()
   const prepared=await stellarRpc.prepareTransaction(unsigned)
   state={source,id,hash:hash(prepared),xdr:prepared.toXDR(),operation:operation.toXDR('base64'),status:'awaiting_signature'};save()
  }
  const transaction=assertStellarEnvelope(state,operation)
  const previous=await stellarRpc.getTransaction(state.hash)
  if(previous.status===rpc.Api.GetTransactionStatus.SUCCESS){state.status='confirmed';delete state.error;save();return previous}
  if(previous.status===rpc.Api.GetTransactionStatus.FAILED){state.status='failed';save();throw new Error(`Stellar transaction failed: ${state.hash}`)}
  if(state.status==='failed')throw new Error('The saved operation failed. Inspect its hash before starting another operation.')
  if(transaction.timeBounds&&Number(transaction.timeBounds.maxTime)*1000<=Date.now())throw new Error(`Recovery required: the saved transaction expired. Reconcile ${state.hash} before preparing a replacement.`)
  await assertStellarWallet(source)
  const signed=await signTransaction(state.xdr,{networkPassphrase:stellarConfig.passphrase,address:source})
  if(signed.error||!signed.signedTxXdr)throw new Error(signed.error?.message??'Freighter did not sign the transaction.')
  const envelope=TransactionBuilder.fromXDR(signed.signedTxXdr,stellarConfig.passphrase)
  if(hash(envelope as Transaction)!==state.hash)throw new Error('Freighter returned a different transaction body.')
  state.status='submitted';delete state.error;save()
  const sent=await stellarRpc.sendTransaction(envelope)
  if(sent.status==='ERROR')throw new Error(`Stellar rejected transaction ${state.hash}. Inspect the saved request before retrying.`)
  for(let attempt=0;attempt<60;attempt++){
   const result=await stellarRpc.getTransaction(state.hash)
   if(result.status===rpc.Api.GetTransactionStatus.SUCCESS){state.status='confirmed';save();return result}
   if(result.status===rpc.Api.GetTransactionStatus.FAILED){state.status='failed';save();throw new Error(`Stellar transaction failed: ${state.hash}`)}
   await new Promise(resolve=>window.setTimeout(resolve,1000))
  }
  throw new Error(`Confirmation pending: resume using saved transaction ${state.hash}.`)
 }catch(error){if(state){state.error=error instanceof Error?error.message:String(error);save()}throw error}
 finally{running.delete(key)}
}
