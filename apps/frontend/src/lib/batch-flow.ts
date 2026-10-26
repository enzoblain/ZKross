import {Address,Operation,scValToNative,rpc,StrKey,Horizon,Asset} from '@stellar/stellar-sdk'
import {encodeFunctionData,erc20Abi,hexToBytes,bytesToHex,pad,parseEventLogs,parseAbiItem,type Address as EvmAddress,type Abi,type Hex} from 'viem'
import {allocationHash,batchEntries,queueMessage,validateMember,type BatchGroup,type BatchMember} from '../../../../packages/batch/src/index'
import {batchConfiguration,joinBatchQueue,pollBatchTicket,ticketAction,type BatchConfig} from './batch-api'
import {saveBatch,type BatchTransfer} from './batch-store'
import {expectedEvmWallet,submitEvm} from './evm-submission'
import {publicClient} from './eth'
import {cctpTestnet,stellarForwarding,forwarderHook,fetchAttestations} from './cctp-wire'
import {sepoliaUsdc} from './cctp-intent'
import {assertPinnedRuntime,type PinnedRuntime} from './runtime-pin'
import {prover,randomField,hex32,fieldNeg} from './zk/prover'
import {noteVault,type RecoveryNote} from './vault-session'
import {encryptNoteOutput} from './note-disclosure'
import {stellarRpc,submitStellarOperation} from './stellar-submit'
import {stellarConfig} from './config'
import {assertPrivateStellarPool,stellarView,stellarCall,uploadInbox,configScVal,nativeExt,stellarExtHash,stellarProofArgs,stellarUsdc,type StellarExt} from './stellar-private'
import stellarArtifacts from './stellar-artifacts.json'
const horizon=new Horizon.Server(stellarConfig.horizonUrl)
async function artifact(){return (await import('./deployment-artifacts.json')).default.CctpBatcher}
const changed=(t:BatchTransfer)=>{delete t.error;saveBatch(t)}
function group(t:BatchTransfer):BatchGroup{const g=t.ticket?.group;if(!g)throw new Error('Le groupe n’est pas encore fixé.');return g}
export async function assertBatcher(config:BatchConfig){
 if(!config.configured||config.chainId!==11155111||config.destinationDomain!==27||config.aggregation!=='single-cctp-burn')throw new Error('Le service testnet n’est pas configuré pour ce parcours collectif.')
 if(await publicClient.getChainId()!==11155111)throw new Error('RPC Ethereum incompatible.')
 const a=await artifact(),abi=a.abi as Abi
 assertPinnedRuntime(await publicClient.getBytecode({address:config.batcher}),a.runtime as PinnedRuntime)
 const read=(functionName:string)=>publicClient.readContract({address:config.batcher,abi,functionName})
 const [token,messenger,forwarder]=await Promise.all([read('token'),read('messenger'),read('forwarder')])
 if(String(token).toLowerCase()!==sepoliaUsdc.toLowerCase()||String(messenger).toLowerCase()!==cctpTestnet.sepolia.messenger.toLowerCase()||String(forwarder).toLowerCase()!==stellarForwarding(cctpTestnet.stellar.forwarder).mintRecipient.toLowerCase())throw new Error('Les contrats collectifs ne correspondent pas à USDC / CCTP testnet.')
 await assertPrivateStellarPool(config.pool)
 return config
}
export async function destinationTrustline(address:string,amount:bigint){
 if(!StrKey.isValidEd25519PublicKey(address))throw new Error('Indique une adresse Stellar G valide pour recevoir les USDC.')
 const account=await horizon.loadAccount(address)
 const line=account.balances.find(b=>'asset_code'in b&&b.asset_code==='USDC'&&b.asset_issuer==='GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5')
 if(!line||!('limit'in line)||line.is_authorized===false)throw new Error('Le portefeuille destinataire doit être activé et autoriser USDC testnet (trustline).')
 const units=(s:string)=>BigInt(s.replace('.',''))
 if(units(line.limit)-units(line.balance)-units(('buying_liabilities'in line?line.buying_liabilities:'0.0000000'))<amount)throw new Error('La limite USDC du destinataire est insuffisante.')
}
export async function addUsdcTrustline(source:string){return submitStellarOperation(source,'usdc-trustline',Operation.changeTrust({asset:new Asset('USDC','GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'),limit:'1000000'}))}
export async function startCollective(source:EvmAddress,stellar:string,recipient:string,amount:bigint):Promise<BatchTransfer>{
 const config=await assertBatcher(await batchConfiguration());await destinationTrustline(recipient,amount*10n)
 if(noteVault().getSnapshot()==='locked')throw new Error('Ouvre le coffre chiffré avant de préparer tes notes.')
 const id=crypto.randomUUID(),sk=randomField(),blinding=randomField(),pk=await prover.pubkey(sk),dummy={pk:await prover.pubkey(randomField()),blinding:randomField()}
 const cm=await prover.commitment(amount*10n,pk,blinding),dummyCm=await prover.commitment(0n,dummy.pk,dummy.blinding)
 const member:BatchMember={id,source,stellar,amount:amount.toString(),pool:config.pool,commitment0:cm,commitment1:dummyCm,expires:Date.now()+900000};validateMember(member,Date.now())
 await noteVault().saveRecoveryNote({network:'stellar',pool:config.pool,commitment:cm,amount:(amount*10n).toString(),secret:sk,blinding})
 const t:BatchTransfer={version:1,id,member,dummy,recipient,deployLedger:config.deployLedger,phase:'queued',createdAt:Date.now()};saveBatch(t)
 await enrollCollective(t);return t
}
export async function enrollCollective(t:BatchTransfer){
 if(t.ticket)return refreshCollective(t)
 validateMember(t.member,Date.now());const wallet=await expectedEvmWallet(t.member.source)
 const signature=await wallet.signMessage({account:t.member.source,message:queueMessage(t.member)})
 t.ticket=await joinBatchQueue(t.member,signature);t.phase=t.ticket.group?'grouped':'queued';changed(t)
}
export async function refreshCollective(t:BatchTransfer){if(!t.ticket)return;t.ticket=await pollBatchTicket(t.ticket);if(t.ticket.group&&t.phase==='queued')t.phase='grouped';changed(t)}
export async function soloCollective(t:BatchTransfer){if(!t.ticket)throw new Error('Aucune attente active.');t.ticket=await ticketAction(t.ticket,'solo');t.phase='grouped';changed(t)}
export async function cancelCollective(t:BatchTransfer){if(!t.ticket)throw new Error('Aucune attente active.');t.ticket=await ticketAction(t.ticket,'cancel');t.phase='cancelled';changed(t)}
export async function verifyInbox(t:BatchTransfer){
 const g=group(t);if(!g.inbox)throw new Error('Un membre doit créer l’inbox Stellar avant le dépôt Ethereum.')
 const code=await stellarRpc.getContractWasmByContractId(g.inbox)
 const hash=bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(code)))).slice(2)
 if(hash!==stellarArtifacts.batch_inbox)throw new Error('L’inbox Stellar ne correspond pas au contrat collectif vérifié.')
 const cfg=await stellarView<{token:string;pool:string;pool_hash:Uint8Array;manifest:Uint8Array;entries:{amount:bigint;commitment0:bigint;commitment1:bigint}[]}>(g.inbox,'get_config')
 if(cfg.token!==stellarUsdc||cfg.pool!==t.member.pool||bytesToHex(cfg.pool_hash).slice(2)!==stellarArtifacts.pool||bytesToHex(cfg.manifest).toLowerCase()!==allocationHash(g.members).toLowerCase()||cfg.entries.length!==g.members.length)throw new Error('Configuration collective Stellar incorrecte.')
 for(let i=0;i<g.members.length;i++){const a=cfg.entries[i],m=g.members[i];if(a.amount!==BigInt(m.amount)||a.commitment0!==BigInt(m.commitment0)||a.commitment1!==BigInt(m.commitment1))throw new Error('Une allocation privée ne correspond pas au groupe fixé.')}
 if(!g.members.some(m=>m.id===t.id&&m.source.toLowerCase()===t.member.source.toLowerCase()&&m.amount===t.member.amount&&m.commitment0===t.member.commitment0&&m.commitment1===t.member.commitment1))throw new Error('Ta note n’est pas incluse dans ce groupe.')
 return g
}
export async function createCollectiveInbox(t:BatchTransfer){
 const g=group(t);if(g.inbox){await verifyInbox(t);return}
 if(g.members[0].id!==t.id)throw new Error('Le premier membre prépare l’inbox. Actualise le groupe pour suivre sa confirmation.')
 const source=t.member.stellar,digest=await uploadInbox(source),cfg=configScVal(t.member.pool,allocationHash(g.members),g.members)
 const result=await submitStellarOperation(source,`inbox:${g.id}`,Operation.createCustomContract({address:new Address(source),wasmHash:hexToBytes(`0x${digest}`),salt:hexToBytes(g.salt),constructorArgs:[cfg]}))
 if(result.status!==rpc.Api.GetTransactionStatus.SUCCESS||!result.returnValue)throw new Error('Création de l’inbox non confirmée.')
 const inbox=scValToNative(result.returnValue);if(typeof inbox!=='string'||!StrKey.isValidContract(inbox))throw new Error('Adresse inbox invalide.')
 t.ticket=await ticketAction(t.ticket!,'publish',{inbox,inboxHash:result.txHash});changed(t);await verifyInbox(t)
}
async function batchContext(t:BatchTransfer){const config=await assertBatcher(await batchConfiguration());if(config.pool!==t.member.pool)throw new Error('Le pool configuré a changé.');const g=await verifyInbox(t),a=await artifact(),abi=a.abi as Abi
 const args=[g.salt,bytesToHex(new TextEncoder().encode(g.inbox!)),batchEntries(g.members),BigInt(g.deadline)] as const
 const id=await publicClient.readContract({address:config.batcher,abi,functionName:'batchId',args}) as Hex
 if(t.batchId&&t.batchId!==id)throw new Error('Identifiant collectif différent du journal.')
 t.batchId=id;changed(t);return {config,g,abi,args,id}
}
export async function fundCollective(t:BatchTransfer){
 const {config,g,abi,args,id}=await batchContext(t)
 if(g.deadline<=Math.floor(Date.now()/1000)+60)throw new Error('Le délai de financement est terminé ou trop proche. Aucun dépôt supplémentaire n’est demandé.')
 const current=await publicClient.readContract({address:config.batcher,abi,functionName:'getBatch',args:[id]}) as [bigint,boolean,bigint,Hex,Hex,unknown[]]
 if(current[0]===0n)await submitEvm(`${t.id}:create`,t.member.source,config.batcher,encodeFunctionData({abi,functionName:'createBatch',args}))
 const funded=await publicClient.readContract({address:config.batcher,abi,functionName:'funded',args:[id,t.member.source]})
 if(!funded){
  const amount=BigInt(t.member.amount),allowance=await publicClient.readContract({address:sepoliaUsdc,abi:erc20Abi,functionName:'allowance',args:[t.member.source,config.batcher]})
  if(allowance<amount)await submitEvm(`${t.id}:approve`,t.member.source,sepoliaUsdc,encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[config.batcher,amount]}))
  await submitEvm(`${t.id}:fund`,t.member.source,config.batcher,encodeFunctionData({abi,functionName:'fund',args:[id]}))
 }
 t.phase='funded';changed(t)
}
export async function collectiveFunding(t:BatchTransfer){const {config,g,abi,id}=await batchContext(t);const funded=await Promise.all(g.members.map(m=>publicClient.readContract({address:config.batcher,abi,functionName:'funded',args:[id,m.source]})));return {funded:funded.filter(Boolean).length,total:g.members.length,deadline:g.deadline}}
export async function refundCollective(t:BatchTransfer){const {config,abi,id}=await batchContext(t);await submitEvm(`${t.id}:refund`,t.member.source,config.batcher,encodeFunctionData({abi,functionName:'refund',args:[id]}));t.phase='cancelled';changed(t)}
export async function burnCollective(t:BatchTransfer){
 const {config,g,abi,id}=await batchContext(t)
 const current=await publicClient.readContract({address:config.batcher,abi,functionName:'getBatch',args:[id]}) as [bigint,boolean,...unknown[]]
 if(current[1]){
  const event=parseAbiItem('event BatchBurned(bytes32 indexed id,uint256 amount,bytes hook)')
  const logs=await publicClient.getLogs({address:config.batcher,event,args:{id},fromBlock:0n,toBlock:'latest'})
  if(logs.length!==1)throw new Error('Burn déjà confirmé : retrouve son hash dans l’activité du groupe sans brûler à nouveau.')
  t.sourceHash=logs[0].transactionHash!
 }else{
  const receipt=await submitEvm(`batch:${id}:burn`,t.member.source,config.batcher,encodeFunctionData({abi,functionName:'burn',args:[id]}),hash=>{t.sourceHash=hash;changed(t)})
  const events=parseEventLogs({abi,logs:receipt.logs,eventName:'BatchBurned'})
  if(events.length!==1)throw new Error('Burn collectif non confirmé par le contrat.')
  t.sourceHash=receipt.transactionHash
 }
 t.phase='burned';changed(t);t.ticket=await ticketAction(t.ticket!,'publish',{burnHash:t.sourceHash});changed(t)
 if(g.members.length===1&&g.members[0].id!==t.id)throw new Error('Invalid solo owner.')
}
export function validateCollectiveMessage(message:Hex,t:BatchTransfer,batcher:EvmAddress){
 const g=group(t),data=hexToBytes(message);if(data.length!==528)throw new Error('Format du message CCTP collectif invalide.')
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength),u32=(i:number)=>view.getUint32(i,false),word=(i:number)=>bytesToHex(data.slice(i,i+32)).toLowerCase(),eq=(a:unknown,b:unknown,label:string)=>{if(a!==b)throw new Error(`Message CCTP non conforme : ${label}.`)}
 const ew=(a:Hex)=>pad(a,{size:32}).toLowerCase(),sw=(a:string)=>bytesToHex(StrKey.decodeContract(a)).toLowerCase()
 eq(u32(0),1,'version');eq(u32(4),0,'source');eq(u32(8),27,'destination');eq(word(44),ew(cctpTestnet.sepolia.messenger),'messenger source');eq(word(76),sw(cctpTestnet.stellar.messenger),'messenger destination');eq(word(108),sw(cctpTestnet.stellar.forwarder),'caller');eq(u32(140),2000,'finalité');if(u32(144)<2000)throw new Error('Attestation non finalisée.');eq(u32(148),1,'version burn');eq(word(152),ew(sepoliaUsdc),'USDC');eq(word(184),sw(cctpTestnet.stellar.forwarder),'mint recipient');eq(word(248),ew(batcher),'source collectif');eq(BigInt(word(216)),g.members.reduce((n,m)=>n+BigInt(m.amount),0n),'somme du groupe');eq(BigInt(word(280)),0n,'plafond frais');eq(BigInt(word(312)),0n,'frais exécutés');
 const hook=(forwarderHook(g.inbox!)+t.batchId!.slice(2)+allocationHash(g.members).slice(2)).toLowerCase();eq(bytesToHex(data.slice(376)).toLowerCase(),hook,'allocations et inbox');if(BigInt(word(12))===0n)throw new Error('Nonce absent.')
 return word(12) as Hex
}
export async function attestCollective(t:BatchTransfer){
 if(!t.sourceHash)throw new Error('Hash du burn absent.');const config=await assertBatcher(await batchConfiguration()),messages=await fetchAttestations(0,t.sourceHash)
 if(!messages)throw new Error('Circle prépare l’attestation. Reprends cette étape plus tard ; aucun nouvel envoi n’est nécessaire.')
 const valid=messages.filter(m=>{try{validateCollectiveMessage(m.message,t,config.batcher);return true}catch{return false}})
 if(valid.length!==1)throw new Error('Aucune attestation unique ne correspond au groupe fixé.')
 t.message=valid[0].message;t.attestation=valid[0].attestation;t.phase='attested';changed(t)
}
export async function mintCollective(t:BatchTransfer){
 const config=await assertBatcher(await batchConfiguration());if(!t.message||!t.attestation)throw new Error('Attestation absente.');validateCollectiveMessage(t.message,t,config.batcher)
 // The immutable inbox allocation is spendable only after an actual token balance exists.
 // A different participant may have already completed the same public mint.
 const inbox=group(t).inbox!
 const claimed=await Promise.all(group(t).members.map((_,index)=>stellarView<boolean>(inbox,'is_claimed',{index})))
 const remaining=group(t).members.reduce((sum,m,index)=>sum+(claimed[index]?0n:BigInt(m.amount)*10n),0n)
 const nonce=hexToBytes(validateCollectiveMessage(t.message,t,config.batcher))
 const used=await stellarView<boolean>(cctpTestnet.stellar.transmitter,'is_nonce_used',{nonce})
 if(!used)await stellarCall(t.member.stellar,`mint:${t.id}`,cctpTestnet.stellar.forwarder,'mint_and_forward',{message:hexToBytes(t.message),attestation:hexToBytes(t.attestation)},hash=>{t.mintHash=hash;changed(t)})
 if(!await stellarView<boolean>(cctpTestnet.stellar.transmitter,'is_nonce_used',{nonce}))throw new Error('Le nonce CCTP n’est pas confirmé sur Stellar.')
 if(await stellarView<bigint>(stellarUsdc,'balance',{id:inbox})<remaining)throw new Error('Le solde réellement reçu par l’inbox est insuffisant.')
 t.phase='minted';changed(t)
}
function ownNote(t:BatchTransfer):RecoveryNote{const note=noteVault().recoveryNote('stellar',t.member.pool,t.member.commitment0);if(!note)throw new Error('La note privée est absente du coffre. Restaure ta sauvegarde avant de continuer.');return note}
export async function depositCollective(t:BatchTransfer){
 await assertPrivateStellarPool(t.member.pool);const g=await verifyInbox(t),index=g.members.findIndex(m=>m.id===t.id)
 if(await stellarView<boolean>(g.inbox!,'is_claimed',{index})){t.phase='private';changed(t);return}
 if(!t.deposit){
  const note=ownNote(t),pk=await prover.pubkey(note.secret as Hex)
  if(await prover.commitment(BigInt(note.amount),pk,note.blinding as Hex)!==t.member.commitment0)throw new Error('La note sauvegardée ne correspond pas à ton allocation.')
  const ext:StellarExt={recipient:g.inbox!,ext_amount:note.amount,encrypted_output0:bytesToHex(await encryptNoteOutput(note,pk)),encrypted_output1:'0x'}
  const root=await stellarView<bigint>(t.member.pool,'get_root'),hash=await stellarExtHash(t.member.pool,ext)
  const built=await prover.buildPrivateTransact({levels:20,leaves:[],deposit_root:hex32(root),public_amount:note.amount,ext_data_hash:hash,inputs:[{leaf_index:null,sk:randomField(),amount:'0',blinding:randomField()},{leaf_index:null,sk:randomField(),amount:'0',blinding:randomField()}],outputs:[{pk,amount:note.amount,blinding:note.blinding as Hex},{pk:t.dummy.pk,amount:'0',blinding:t.dummy.blinding}]})
  t.deposit={proof:await prover.prove(built),ext};changed(t)
 }
 await stellarCall(t.member.stellar,`deposit:${t.id}`,g.inbox!,'deposit',{index,proof:stellarProofArgs(t.deposit.proof),ext:nativeExt(t.deposit.ext)},hash=>{t.deposit!.hash=hash;changed(t)})
 if(!await stellarView<boolean>(g.inbox!,'is_claimed',{index}))throw new Error('Dépôt privé non confirmé.')
 t.phase='private';changed(t)
}
async function stellarLeaves(t:BatchTransfer){
 const leaves:Hex[]=[];let cursor:string|undefined;const filters:rpc.Api.EventFilter[]=[{type:'contract',contractIds:[t.member.pool]}]
 for(;;){const response=await stellarRpc.getEvents(cursor?{cursor,filters,limit:1000}:{startLedger:t.deployLedger,filters,limit:1000});for(const e of response.events){const topics=e.topic.map(v=>scValToNative(v));if(topics[0]!=='new_commitment_event')continue;const data=scValToNative(e.value) as {index:number};leaves[Number(data.index)]=hex32(topics[1] as bigint)}if(response.events.length<1000)break;if(response.cursor===cursor)throw new Error('Pagination Stellar bloquée.');cursor=response.cursor}
 for(let i=0;i<leaves.length;i++)if(!leaves[i])throw new Error('Historique du pool incomplet : aucun retrait n’est soumis.')
 const root=await stellarView<bigint>(t.member.pool,'get_root');if(BigInt(await prover.treeRoot(leaves))!==root)throw new Error('Historique du pool indisponible ou expiré. Un indexeur d’archive est nécessaire ; tes fonds restent dans le pool.')
 return leaves
}
export async function withdrawCollective(t:BatchTransfer){
 if(t.phase!=='private'&&t.phase!=='delivered')throw new Error('Le dépôt privé doit être confirmé avant le retrait.')
 if(t.phase==='delivered')return
 await assertPrivateStellarPool(t.member.pool);const note=ownNote(t);await destinationTrustline(t.recipient,BigInt(note.amount))
 if(!t.withdrawal){
  const leaves=await stellarLeaves(t),index=leaves.findIndex(cm=>cm===t.member.commitment0);if(index<0)throw new Error('Note privée introuvable dans l’arbre confirmé.')
  const ext:StellarExt={recipient:t.recipient,ext_amount:(-BigInt(note.amount)).toString(),encrypted_output0:'0x',encrypted_output1:'0x'},hash=await stellarExtHash(t.member.pool,ext)
  const built=await prover.buildPrivateTransact({levels:20,leaves,public_amount:fieldNeg(BigInt(note.amount)),ext_data_hash:hash,inputs:[{leaf_index:index,sk:note.secret as Hex,amount:note.amount,blinding:note.blinding as Hex},{leaf_index:null,sk:randomField(),amount:'0',blinding:randomField()}],outputs:[{pk:await prover.pubkey(randomField()),amount:'0',blinding:randomField()},{pk:await prover.pubkey(randomField()),amount:'0',blinding:randomField()}]})
  t.withdrawal={proof:await prover.prove(built),ext};changed(t)
 }
 await stellarCall(t.member.stellar,`withdraw:${t.id}`,t.member.pool,'transact',{proof:stellarProofArgs(t.withdrawal.proof),ext_data:nativeExt(t.withdrawal.ext),sender:t.member.stellar},hash=>{t.withdrawal!.hash=hash;changed(t)})
 t.phase='delivered';changed(t)
}
