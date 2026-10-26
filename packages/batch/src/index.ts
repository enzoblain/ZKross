import {encodeAbiParameters,keccak256,type Address,type Hex} from 'viem'
export type BatchMember={id:string;source:Address;stellar:string;amount:string;commitment0:Hex;commitment1:Hex;pool:string;expires:number}
export type BatchGroup={id:Hex;salt:Hex;members:BatchMember[];deadline:number;inbox?:string;inboxHash?:string;burnHash?:Hex}
export type QueueTicket={id:string;token:string;deadline:number;status:'waiting'|'solo_choice'|'grouped'|'cancelled';group?:BatchGroup}
export const entryAbi={type:'tuple[]',components:[{name:'owner',type:'address'},{name:'amount',type:'uint64'},{name:'commitment0',type:'uint256'},{name:'commitment1',type:'uint256'}]} as const
export const batchEntries=(members:BatchMember[])=>members.map(m=>({owner:m.source,amount:BigInt(m.amount),commitment0:BigInt(m.commitment0),commitment1:BigInt(m.commitment1)}))
export function allocationHash(members:BatchMember[]){return keccak256(encodeAbiParameters([entryAbi],[batchEntries(members)]))}
export function queueMessage(member:BatchMember){return ['ZKross testnet collective bridge intent v1','Chain: 11155111','Destination: Stellar Testnet (27)',`Ticket: ${member.id}`,`Source: ${member.source.toLowerCase()}`,`Stellar signer: ${member.stellar}`,`USDC micro-units: ${member.amount}`,`Private pool: ${member.pool}`,`Commitment 0: ${member.commitment0.toLowerCase()}`,`Commitment 1: ${member.commitment1.toLowerCase()}`,`Expires: ${member.expires}`,'Queue participation only. This signature cannot move tokens. Funding requires a separate on-chain approval and deposit.'].join('\n')}
export function validateMember(m:BatchMember,now:number){
 const R=21888242871839275222246405745257275088548364400416034343698204186575808495617n
 if(!m||!/^[a-zA-Z0-9-]{16,64}$/.test(m.id)||!/^0x[0-9a-fA-F]{40}$/.test(m.source)||BigInt(m.source)===0n||!/^G[A-Z2-7]{55}$/.test(m.stellar)||!/^C[A-Z2-7]{55}$/.test(m.pool)||!(/^[1-9][0-9]{0,11}$/).test(m.amount)||BigInt(m.amount)>100000000000n||!Number.isSafeInteger(m.expires)||m.expires<=now||m.expires>now+900000)throw new Error('Invalid or expired batch intent.')
 for(const cm of [m.commitment0,m.commitment1])if(!/^0x[0-9a-fA-F]{64}$/.test(cm)||BigInt(cm)>=R)throw new Error('Invalid commitment.')
 if(BigInt(m.commitment0)===0n)throw new Error('Invalid funded commitment.')
}
