import type { Hex } from 'viem'
export type LinkReferences=Record<string,Record<string,{start:number;length:number}[]>>
export function linkBytecode(bytecode:string,references:LinkReferences,addresses:Record<string,string>):Hex {
 let code=bytecode.replace(/^0x/,'')
 for(const libraries of Object.values(references)) for(const [library,slots] of Object.entries(libraries)) {
  const address=addresses[library]
  if(!/^0x[0-9a-fA-F]{40}$/.test(address??''))throw new Error(`Missing deployment library: ${library}`)
  for(const {start,length} of slots){
   if(length!==20 || start<0 || (start+length)*2>code.length)throw new Error('Invalid bytecode link reference.')
   code=code.slice(0,start*2)+address.slice(2)+code.slice((start+length)*2)
  }
 }
 if(!/^(?:[0-9a-fA-F]{2})+$/.test(code))throw new Error('Unresolved deployment bytecode.')
 return `0x${code}`
}
