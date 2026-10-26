import {expect,it} from 'vitest'
import {Account,Keypair,Operation,Asset,TransactionBuilder,BASE_FEE} from '@stellar/stellar-sdk'
import {bytesToHex} from 'viem'
import {assertStellarEnvelope,type StellarSubmission} from './stellar-submit'
const source=Keypair.random().publicKey(),destination=Keypair.random().publicKey()
const operation=Operation.payment({destination,asset:Asset.native(),amount:'1'})
function state(op=operation):StellarSubmission{
 const tx=new TransactionBuilder(new Account(source,'1'),{fee:BASE_FEE,networkPassphrase:'Test SDF Network ; September 2015'}).addOperation(op).setTimeout(300).build()
 return {source,id:'fixture',hash:bytesToHex(tx.hash()).slice(2),xdr:tx.toXDR(),operation:operation.toXDR('base64'),status:'awaiting_signature'}
}
it('binds the saved envelope to the source, hash and actual single requested operation',()=>{
 expect(()=>assertStellarEnvelope(state(),operation)).not.toThrow()
 expect(()=>assertStellarEnvelope({...state(),source:destination},operation)).toThrow('source or hash')
 expect(()=>assertStellarEnvelope({...state(),hash:'0'.repeat(64)},operation)).toThrow('source or hash')
 const altered=Operation.payment({destination,asset:Asset.native(),amount:'2'})
 // Even a self-consistent substituted envelope/hash cannot substitute the requested call.
 expect(()=>assertStellarEnvelope(state(altered),operation)).toThrow('operation differs')
})
