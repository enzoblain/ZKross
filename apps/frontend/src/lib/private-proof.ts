import { hexToBytes } from 'viem'
import { R } from './zk/prover'
import type { Proved } from './zk/types'
export function privateProofSignals(proof:Proved){
 if(proof.words.length!==8||proof.public_signals.length!==7||!/^0x[0-9a-fA-F]{512}$/.test(proof.proof))throw new Error('Invalid non-GVK proof shape.')
 if(proof.words.some(word=>!/^0x[0-9a-fA-F]{64}$/.test(word))||proof.public_signals.some(word=>!/^0x[0-9a-fA-F]{64}$/.test(word)||BigInt(word)>=R))throw new Error('Invalid proof field encoding.')
 if(proof.words.map(word=>word.slice(2)).join('').toLowerCase()!==proof.proof.slice(2).toLowerCase())throw new Error('Proof words differ from proof bytes.')
 return proof.public_signals
}
export function ethereumPrivateProof(proof:Proved){
 const s=privateProofSignals(proof)
 return {proof:proof.words.map(BigInt) as [bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint],root:BigInt(s[0]),publicAmount:BigInt(s[1]),extDataHash:s[2],inputNullifiers:[BigInt(s[3]),BigInt(s[4])] as const,outputCommitments:[BigInt(s[5]),BigInt(s[6])] as const}
}
export function stellarPrivateProof(proof:Proved){
 const s=privateProofSignals(proof),bytes=hexToBytes(proof.proof)
 return {proof:{a:bytes.slice(0,64),b:bytes.slice(64,192),c:bytes.slice(192)},root:BigInt(s[0]),public_amount:BigInt(s[1]),ext_data_hash:hexToBytes(s[2]),input_nullifiers:[BigInt(s[3]),BigInt(s[4])],output_commitment0:BigInt(s[5]),output_commitment1:BigInt(s[6]),asp_membership_root:0n,asp_non_membership_root:0n}
}
