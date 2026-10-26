import type {Address,Hex} from 'viem'
import type {Proved} from './zk/types'
export type LivePhase='waiting'|'solo_choice'|'ready'|'burn_pending'|'source_confirmed'|'attested'|'minted'|'deposit_pending'|'private'|'withdraw_pending'|'delivered'|'cancelled'
export type PublicPrivateOperation={proof:Proved;ext:{recipient:string;ext_amount:string;encrypted_output0:Hex;encrypted_output1:Hex};commitment:Hex;amount:string;hash?:string}
export type LiveTransfer={version:1;id:string;source:Address;stellarSigner:string;recipient:string;amount:string;maxFee:string;pool:string;deployLedger:number;createdAt:number;deadline:number;phase:LivePhase;departure?:'coordinated'|'solo';queueId?:string;queueToken?:string;groupSize?:number;burnHash?:Hex;burnPending?:boolean;approvalHash?:Hex;message?:Hex;attestation?:Hex;nonce?:Hex;fee?:string;netAmount?:string;mintHash?:string;deposit?:PublicPrivateOperation;withdrawal?:PublicPrivateOperation;error?:string}
const prefix='zkross:live-forward:v1:'
const listeners=new Set<()=>void>()
export const subscribeLive=(callback:()=>void)=>{listeners.add(callback);return()=>{listeners.delete(callback)}}
let revision=0
export const liveRevision=()=>revision
export function saveLive(transfer:LiveTransfer){window.localStorage.setItem(prefix+transfer.id,JSON.stringify(transfer));revision++;listeners.forEach(fn=>fn())}
export function loadLive(id:string):LiveTransfer{
 const raw=window.localStorage.getItem(prefix+id);if(!raw)throw new Error('Transfer journal not found.')
 const item=JSON.parse(raw) as LiveTransfer
 if(item.version!==1||item.id!==id||!/^0x[0-9a-fA-F]{40}$/.test(item.source)||!/^\d+$/.test(item.amount)||BigInt(item.amount)<=0n)throw new Error('Invalid transfer journal.')
 return item
}
export function liveTransfers(source?:string,stellar?:string):LiveTransfer[]{
 const result:LiveTransfer[]=[]
 for(let i=0;i<window.localStorage.length;i++){const key=window.localStorage.key(i);if(!key?.startsWith(prefix))continue;try{const t=loadLive(key.slice(prefix.length));if((source&&t.source.toLowerCase()===source.toLowerCase())||(stellar&&t.stellarSigner===stellar))result.push(t)}catch{/* Invalid records are not trusted. */}}
 return result.sort((a,b)=>b.createdAt-a.createdAt)
}
export function waitingState(transfer:Pick<LiveTransfer,'phase'|'deadline'>,now:number,peers:number):LivePhase{
 if(transfer.phase!=='waiting'&&transfer.phase!=='solo_choice')return transfer.phase
 if(peers>=2)return 'ready'
 return now>=transfer.deadline?'solo_choice':'waiting'
}
export function chooseSolo(t:LiveTransfer,now:number){if(t.phase!=='solo_choice'||now<t.deadline)throw new Error('The waiting period has not ended.');t.departure='solo';t.groupSize=1;t.phase='ready';saveLive(t)}
