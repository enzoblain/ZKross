import { expect,it } from 'vitest'
import { encryptNoteOutput,decryptNoteOutput,noteViewKey } from './note-disclosure'
import type { RecoveryNote } from './vault-session'
const note:RecoveryNote={network:'ethereum',pool:'test-pool',amount:'100',commitment:`0x${'01'.repeat(32)}`,secret:`0x${'02'.repeat(32)}`,blinding:`0x${'03'.repeat(32)}`}
it('discloses note data without disclosing the spending key',async()=>{
 const ciphertext=await encryptNoteOutput(note,'0x1234')
 const disclosed=await decryptNoteOutput(ciphertext,await noteViewKey(note),note)
 expect(disclosed.amount).toBe('100');expect(disclosed.blinding).toBe(note.blinding);expect(disclosed).not.toHaveProperty('secret')
})
it('binds view access to the chain, pool and commitment',async()=>{
 const ciphertext=await encryptNoteOutput(note,'0x1234'),key=await noteViewKey(note)
 for(const changed of [{...note,network:'stellar' as const},{...note,pool:'another-pool'},{...note,commitment:`0x${'04'.repeat(32)}`}])await expect(decryptNoteOutput(ciphertext,key,changed)).rejects.toThrow()
 expect(await noteViewKey({...note,pool:'another-pool'})).not.toBe(key)
})
