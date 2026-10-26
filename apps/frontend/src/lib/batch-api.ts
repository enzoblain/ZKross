import type {Address} from 'viem'
import type {BatchMember,QueueTicket} from '../../../../packages/batch/src/index'
export type BatchConfig={version:1;chainId:11155111;destinationDomain:27;pool:string;batcher:Address;deployLedger:number;waitMs:number;maxMembers:number;minMembers:number;configured:boolean;aggregation:string}
const url=(import.meta.env.VITE_BATCH_API_URL as string|undefined)??'http://127.0.0.1:8787'
export async function batchApi<T>(path:string,body?:object,token?:string):Promise<T>{
 const response=await fetch(new URL(path,url),{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)})
 const result=await response.json();if(!response.ok)throw new Error(result.error??`Batch API: ${response.status}`);return result as T
}
export const batchConfiguration=()=>batchApi<BatchConfig>('/config')
export const joinBatchQueue=(member:BatchMember,signature:string)=>batchApi<QueueTicket>('/queue',{member,signature})
export const pollBatchTicket=(t:QueueTicket)=>batchApi<QueueTicket>(`/queue/${t.id}`,undefined,t.token)
export const ticketAction=(t:QueueTicket,action:'solo'|'cancel'|'publish',body:object={})=>batchApi<QueueTicket>(`/queue/${t.id}/${action}`,body,t.token)
