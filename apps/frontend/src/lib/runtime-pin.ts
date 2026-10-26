import type {Hex} from 'viem'
import type {LinkReferences} from './bytecode-linker'
type Slot={start:number;length:number}
export type PinnedRuntime={object:string;immutableReferences:Record<string,Slot[]>;linkReferences:LinkReferences}
/** Compare every instruction/constant except Solidity's declared immutable and library slots. */
export function assertPinnedRuntime(code:Hex|undefined,runtime:PinnedRuntime,library=false){
 if(!code||code==='0x')throw new Error('Contract code is absent.')
 let actual=code.slice(2).toLowerCase(),expected=runtime.object.replace(/^0x/,'').toLowerCase()
 if(actual.length!==expected.length)throw new Error('Contract runtime size differs from this build.')
 const mask=(slot:Slot)=>{const start=slot.start*2,length=slot.length*2;actual=actual.slice(0,start)+'0'.repeat(length)+actual.slice(start+length);expected=expected.slice(0,start)+'0'.repeat(length)+expected.slice(start+length)}
 for(const slots of Object.values(runtime.immutableReferences??{}))for(const slot of slots)mask(slot)
 const libraries=new Set<string>()
 for(const file of Object.values(runtime.linkReferences??{}))for(const slots of Object.values(file))for(const slot of slots){libraries.add('0x'+actual.slice(slot.start*2,(slot.start+slot.length)*2));mask(slot)}
 // Solidity libraries replace the initial PUSH20 zero address with their own address.
 if(library){if(!actual.startsWith('73')||!expected.startsWith('73'))throw new Error('Unexpected library guard.');mask({start:1,length:20})}
 if(actual!==expected)throw new Error('Contract runtime differs from the pinned private build.')
 return [...libraries]
}
