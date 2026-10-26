import { bytesToHex,hexToBytes,type Hex } from 'viem'
import type { RecoveryNote } from './vault-session'
const text=new TextEncoder()
const context=(note:Pick<RecoveryNote,'network'|'pool'|'commitment'>)=>`zkross.note.v1|${note.network}|${note.pool}|${note.commitment}`
/** A note-scoped view key is distinct from the spending key. Sharing it cannot
 * reconstruct the spending key. No administrator has a universal view key.
 */
export async function noteViewKey(note:RecoveryNote):Promise<Hex>{
 return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256',text.encode(`${context(note)}|${note.secret}`))))
}
export async function encryptNoteOutput(note:RecoveryNote,ownerPublicKey:Hex):Promise<Uint8Array>{
 const key=await crypto.subtle.importKey('raw',new Uint8Array(hexToBytes(await noteViewKey(note))),'AES-GCM',false,['encrypt'])
 const iv=crypto.getRandomValues(new Uint8Array(12))
 const payload=text.encode(JSON.stringify({version:1,amount:note.amount,publicKey:ownerPublicKey,blinding:note.blinding,commitment:note.commitment}))
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:text.encode(context(note))},key,payload))
 const output=new Uint8Array(13+cipher.length);output[0]=1;output.set(iv,1);output.set(cipher,13);return output
}
export async function decryptNoteOutput(bytes:Uint8Array,viewKey:Hex,note:Pick<RecoveryNote,'network'|'pool'|'commitment'>){
 if(bytes[0]!==1||bytes.length<29)throw new Error('Invalid encrypted note format.')
 const key=await crypto.subtle.importKey('raw',new Uint8Array(hexToBytes(viewKey)),'AES-GCM',false,['decrypt'])
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(bytes.slice(1,13)),additionalData:text.encode(context(note))},key,new Uint8Array(bytes.slice(13)))
 return JSON.parse(new TextDecoder().decode(plain)) as {version:1;amount:string;publicKey:Hex;blinding:Hex;commitment:Hex}
}
