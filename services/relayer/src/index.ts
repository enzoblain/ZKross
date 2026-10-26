import {createServer} from 'node:http'
import {mkdirSync,chmodSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {verifyMessage} from 'viem'
import {StrKey} from '@stellar/stellar-sdk'
import {queueMessage,validateMember,type BatchMember} from '../../../packages/batch/src/index.ts'
import {BatchQueue} from './queue.ts'
const port=Number(process.env.PORT??8787),dbPath=resolve(process.env.BATCH_DB??'data/batches.sqlite')
mkdirSync(dirname(dbPath),{recursive:true,mode:0o700});const queue=new BatchQueue(dbPath,Number(process.env.BATCH_WAIT_MS??120000));chmodSync(dbPath,0o600)
const origins=(process.env.ALLOWED_ORIGINS??'http://127.0.0.1:5173,http://localhost:5173').split(',')
const pool=process.env.STELLAR_PRIVATE_POOL??'',batcher=process.env.CCTP_BATCHER??'',deployLedger=Number(process.env.STELLAR_POOL_DEPLOY_LEDGER??0)
const rates=new Map<string,{at:number;count:number}>()
createServer(async(req,res)=>{
 const origin=req.headers.origin;if(origin&&!origins.includes(origin)){res.writeHead(403);res.end();return}
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');if(origin)res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS')
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
 const send=(value:unknown,status=200)=>{res.writeHead(status);res.end(JSON.stringify(value))}
 try{
  const now=Date.now(),ip=req.socket.remoteAddress??'unknown';let rate=rates.get(ip);if(!rate||now-rate.at>60000){rate={at:now,count:0};rates.set(ip,rate)}if(++rate.count>120){send({error:'Rate limit exceeded.'},429);return}if(rates.size>10000)for(const[k,v]of rates)if(now-v.at>60000)rates.delete(k)
  const path=new URL(req.url??'/','http://local').pathname
  if(req.method==='GET'&&path==='/config'){send({version:1,chainId:11155111,destinationDomain:27,pool,batcher,deployLedger,waitMs:queue.waitMs,maxMembers:8,minMembers:2,aggregation:'single-cctp-burn',configured:StrKey.isValidContract(pool)&&/^0x[0-9a-fA-F]{40}$/.test(batcher)&&deployLedger>0});return}
  let body:Record<string,unknown>={}
  if(req.method==='POST'){let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>16384)throw new Error('Request too large.');chunks.push(chunk)}body=JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string,unknown>}
  if(path==='/queue'&&req.method==='POST'){
   const member=body.member as BatchMember;validateMember(member,now)
   if(member.pool!==pool||!StrKey.isValidEd25519PublicKey(member.stellar))throw new Error('Unsupported pool or wallet.')
   if(!await verifyMessage({address:member.source,message:queueMessage(member),signature:body.signature as `0x${string}`}))throw new Error('Invalid wallet intent signature.')
   send(queue.join(member,now));return
  }
  const match=/^\/queue\/([a-zA-Z0-9-]{16,64})(?:\/(solo|cancel|publish))?$/.exec(path)
  if(match){const id=match[1]!,token=req.headers.authorization?.replace(/^Bearer /,'')??'';if(!/^[0-9a-f]{64}$/.test(token))throw new Error('Missing ticket authorization.')
   if(req.method==='GET'&&!match[2]){send(queue.get(id,token,now));return}
   if(req.method==='POST'&&match[2]==='solo'){send(queue.solo(id,token,now));return}
   if(req.method==='POST'&&match[2]==='cancel'){send(queue.cancel(id,token,now));return}
   if(req.method==='POST'&&match[2]==='publish'){
    const patch: {inbox?:string;inboxHash?:string;burnHash?:`0x${string}`}={}
    if(body.inbox!==undefined){if(typeof body.inbox!=='string'||!StrKey.isValidContract(body.inbox))throw new Error('Invalid inbox.');patch.inbox=body.inbox}
    if(body.inboxHash!==undefined){if(typeof body.inboxHash!=='string'||!/^[0-9a-f]{64}$/.test(body.inboxHash))throw new Error('Invalid Stellar hash.');patch.inboxHash=body.inboxHash}
    if(body.burnHash!==undefined){if(typeof body.burnHash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(body.burnHash))throw new Error('Invalid Ethereum hash.');patch.burnHash=body.burnHash as `0x${string}`}
    send(queue.publish(id,token,patch,now));return
   }
  }
  send({error:'Not found.'},404)
 }catch(error){send({error:error instanceof Error?error.message:'Request failed.'},400)}
}).listen(port,'0.0.0.0',()=>console.log(`ZKross batch coordinator listening on ${port}. No transaction signer is configured.`))
