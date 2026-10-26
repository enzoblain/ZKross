import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from './ui/button'
import { noteVault } from '../lib/vault-session'
export function NoteVaultPanel() {
  const [vault] = useState(noteVault)
  const snapshot=useSyncExternalStore(vault.subscribe,vault.getSnapshot,()=> 'locked')
  const [passphrase,setPassphrase]=useState('')
  const [backup,setBackup]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const unlocked=snapshot!=='locked'
  useEffect(()=>{
    const hide=()=>{if(document.hidden) vault.lock()}
    document.addEventListener('visibilitychange',hide)
    return ()=>{document.removeEventListener('visibilitychange',hide);vault.lock()}
  },[vault])
  async function unlock(restore=false) {
    setBusy(true);setError('')
    try { if(restore) await vault.restore(backup,passphrase); else await vault.unlock(passphrase);setBackup('') }
    catch(reason) {setError(reason instanceof Error ? reason.message : String(reason))}
    finally {setPassphrase('');setBusy(false)}
  }
  function download() {
    try {
      const url=URL.createObjectURL(new Blob([vault.exportEncrypted()],{type:'application/json'}))
      const link=document.createElement('a');link.href=url;link.download='zkross-encrypted-notes.json';link.click()
      window.setTimeout(()=>URL.revokeObjectURL(url),1000)
    } catch(reason) {setError(reason instanceof Error ? reason.message : String(reason))}
  }
  return <section className="space-y-4 rounded-3xl border border-border bg-surface p-6"><h2 className="text-xl font-medium">Encrypted recovery vault</h2>
    <p className="text-sm text-muted">{unlocked ? 'Unlocked in this page. No on-chain balance is inferred from recovery records.' : 'Locked. Your recovery data stays encrypted in this browser.'}</p>
    <p className="text-xs text-muted">Use a strong independent passphrase, never your wallet seed phrase or private key. Losing the passphrase and backup can make funds unrecoverable. Existing legacy plaintext records are not migrated or deleted.</p>
    {!unlocked && <><label className="block text-sm">Vault passphrase<input type="password" autoComplete="off" minLength={12} className="mt-2 block w-full rounded border border-border bg-background p-2" value={passphrase} onChange={event=>setPassphrase(event.target.value)} disabled={busy}/></label><Button disabled={busy || passphrase.length<12} onClick={()=>void unlock()}>{busy ? 'Opening…' : vault.hasBackup() ? 'Unlock vault' : 'Create encrypted vault'}</Button>
    <details><summary className="cursor-pointer text-sm">Restore an encrypted backup</summary><label className="mt-3 block text-sm">Encrypted backup JSON<textarea className="mt-2 block min-h-24 w-full rounded border border-border bg-background p-2 font-mono text-xs" value={backup} onChange={event=>setBackup(event.target.value)} disabled={busy}/></label><Button variant="secondary" disabled={busy || !backup || passphrase.length<12} onClick={()=>void unlock(true)}>Restore encrypted backup</Button></details></>}
    {unlocked && <Button variant="secondary" onClick={()=>{vault.lock();setPassphrase('')}}>Lock vault</Button>}
    <Button variant="secondary" disabled={!vault.hasBackup()} onClick={download}>Export encrypted backup</Button>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </section>
}
