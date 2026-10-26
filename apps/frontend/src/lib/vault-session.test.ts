import { describe, expect, it } from 'vitest'
import { NoteVaultSession, type RecoveryNote } from './vault-session'
const password='test-only independent passphrase'
const note: RecoveryNote={network:'stellar',pool:'test-pool',commitment:`0x${'11'.repeat(32)}`,amount:'10',secret:`0x${'22'.repeat(32)}`,blinding:`0x${'03'.repeat(32)}`}
const storage=()=>{const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)}}}
describe('integrated encrypted note session',()=>{
  it('stores only ciphertext and supports locked encrypted export',async()=>{
    const backing=storage(),session=new NoteVaultSession(backing)
    await session.unlock(password);await session.saveRecoveryNote(note)
    expect(session.getSnapshot()).toContain('"count":1')
    session.lock();expect(session.getSnapshot()).toBe('locked')
    const backup=session.exportEncrypted();expect(backup).not.toContain(note.secret);expect(backup).not.toContain('test-pool')
    const recovered=new NoteVaultSession(storage());await recovered.restore(backup,password)
    expect(recovered.getSnapshot()).toContain('"count":1')
    expect(recovered.recoveryNote('stellar','test-pool',note.commitment)?.blinding).toBe(note.blinding)
  })
  it('rejects writes while locked',async()=>{
    await expect(new NoteVaultSession(storage()).saveRecoveryNote(note)).rejects.toThrow('Unlock')
  })
  it('refuses duplicate notes without changing the saved backup',async()=>{
    const session=new NoteVaultSession(storage());await session.unlock(password);await session.saveRecoveryNote(note)
    const before=session.exportEncrypted();await expect(session.saveRecoveryNote(note)).rejects.toThrow('Duplicate');expect(session.exportEncrypted()).toBe(before)
  })
  it('never overwrites an existing vault during restore',async()=>{
    const session=new NoteVaultSession(storage());await session.unlock(password)
    await expect(session.restore(session.exportEncrypted(),password)).rejects.toThrow('existing vault')
  })
  it('does not reopen after a lock interrupts password derivation',async()=>{
    const session=new NoteVaultSession(storage());const opening=session.unlock(password);session.lock()
    await expect(opening).rejects.toThrow('locked during unlock');expect(session.getSnapshot()).toBe('locked');expect(session.hasBackup()).toBe(false)
  })
  it('cancels an in-flight save after disconnect/lock',async()=>{
    const session=new NoteVaultSession(storage());await session.unlock(password);const before=session.exportEncrypted()
    const saving=session.saveRecoveryNote(note);session.lock()
    await expect(saving).rejects.toThrow('locked during save');expect(session.exportEncrypted()).toBe(before)
  })
  it('cannot unlock an existing backup with a wrong password',async()=>{
    const backing=storage(),session=new NoteVaultSession(backing);await session.unlock(password);session.lock()
    await expect(session.unlock('another long password')).rejects.toThrow();expect(session.getSnapshot()).toBe('locked')
  })
})
