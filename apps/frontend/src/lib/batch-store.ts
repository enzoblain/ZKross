import type {BatchMember,QueueTicket} from '../../../../packages/batch/src/index'
import type {Hex} from 'viem'
import type {Proved} from './zk/types'
export type BatchPhase='queued'|'grouped'|'funded'|'burned'|'attested'|'minted'|'private'|'delivered'|'cancelled'
export type PoolOperation={proof:Proved;ext:{recipient:string;ext_amount:string;encrypted_output0:Hex;encrypted_output1:Hex};hash?:string}
export type BatchTransfer={version:1;id:string;member:BatchMember;dummy:{pk:Hex;blinding:Hex};recipient:string;deployLedger:number;ticket?:QueueTicket;phase:BatchPhase;batchId?:Hex;sourceHash?:Hex;message?:Hex;attestation?:Hex;mintHash?:string;deposit?:PoolOperation;withdrawal?:PoolOperation;error?:string;createdAt:number}
const prefix='zkross:collective:v1:'
const listeners=new Set<()=>void>();let revision=0
export const batchRevision=()=>revision
export const subscribeBatch=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}
export function saveBatch(t:BatchTransfer){window.localStorage.setItem(prefix+t.id,JSON.stringify(t));revision++;listeners.forEach(l=>l())}
export function readBatch(id:string){const raw=window.localStorage.getItem(prefix+id);if(!raw)throw new Error('Saved transfer not found.');const t=JSON.parse(raw) as BatchTransfer;if(t.version!==1||t.id!==id||!t.member||t.member.id!==id)throw new Error('Invalid collective journal.');return t}
export function ownBatches(ethereum?:string,stellar?:string){const rows:BatchTransfer[]=[];for(let i=0;i<window.localStorage.length;i++){const key=window.localStorage.key(i);if(!key?.startsWith(prefix))continue;try{const t=readBatch(key.slice(prefix.length));if((ethereum&&t.member.source.toLowerCase()===ethereum.toLowerCase())||(stellar&&t.member.stellar===stellar))rows.push(t)}catch{/* Invalid local journal is not trusted. */}}return rows.sort((a,b)=>b.createdAt-a.createdAt)}
