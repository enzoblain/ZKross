import {expect,it} from 'vitest'
import {assertPinnedRuntime,type PinnedRuntime} from './runtime-pin'
const fixture:PinnedRuntime={object:'0x60000000006001',immutableReferences:{a:[{start:1,length:2}]},linkReferences:{}}
it('accepts declared immutable substitutions and rejects instruction changes',()=>{
 expect(()=>assertPinnedRuntime('0x60ffff00006001',fixture)).not.toThrow()
 expect(()=>assertPinnedRuntime('0x60ffff00006002',fixture)).toThrow('differs')
 expect(()=>assertPinnedRuntime('0x60',fixture)).toThrow('size')
 expect(()=>assertPinnedRuntime(undefined,fixture)).toThrow('absent')
})
