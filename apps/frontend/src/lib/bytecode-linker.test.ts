import { expect,it } from 'vitest'
import { linkBytecode } from './bytecode-linker'
it('links exact Solidity library slots',()=>{
 const address=`0x${'12'.repeat(20)}`
 expect(linkBytecode(`0x60${'_'.repeat(40)}00`,{'A.sol':{A:[{start:1,length:20}]}},{A:address})).toBe(`0x60${address.slice(2)}00`)
})
it('refuses missing links and invalid references',()=>{
 expect(()=>linkBytecode('0x0000',{'A.sol':{A:[{start:1,length:20}]}},{})).toThrow()
 expect(()=>linkBytecode('0x0000',{'A.sol':{A:[{start:1,length:20}]}},{A:`0x${'12'.repeat(20)}`})).toThrow()
 expect(()=>linkBytecode('0x__$unresolved$__',{},{})).toThrow()
})
