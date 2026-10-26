import { decryptNotes, encryptNotes } from './note-vault'
export type RecoveryNote = { network: 'ethereum' | 'stellar'; pool: string; commitment: string; amount: string; secret: string; blinding: string }
type VaultData = { version: 1; notes: RecoveryNote[] }
const STORAGE_KEY = 'zkross:encrypted-notes:v1'
const empty = (): VaultData => ({ version: 1, notes: [] })
function validate(raw: string): VaultData {
  const data = JSON.parse(raw) as VaultData
  if (!data || data.version !== 1 || !Array.isArray(data.notes) || data.notes.length > 1000) throw new Error('Invalid note backup schema.')
  const seen = new Set<string>()
  for (const note of data.notes) {
    if (!note || !['ethereum','stellar'].includes(note.network) || typeof note.pool !== 'string' || !note.pool || !/^0x[0-9a-fA-F]{64}$/.test(note.commitment) || !/^0x[0-9a-fA-F]{64}$/.test(note.secret) || !/^0x[0-9a-fA-F]{64}$/.test(note.blinding) || !/^[1-9][0-9]{0,38}$/.test(note.amount)) throw new Error('Invalid recovery note.')
    const field = 21888242871839275222246405745257275088548364400416034343698204186575808495617n
    if (BigInt(note.secret) === 0n || BigInt(note.secret) >= field || BigInt(note.blinding) >= field || BigInt(note.commitment) >= field) throw new Error('Noncanonical note field.')
    const id = `${note.network}:${note.pool}:${note.commitment}`
    if (seen.has(id)) throw new Error('Duplicate recovery note.')
    seen.add(id)
  }
  return data
}
/** Keeps unlocked records only in memory. There is no server escrow or automatic
 * plaintext migration. Recovery records are NOT evidence of spendable on-chain funds.
 */
export class NoteVaultSession {
  private data: VaultData | null = null
  private passphrase: string | null = null
  private epoch = 0
  private listeners = new Set<() => void>()
  private snapshot = 'locked'
  private writing = false
  private storage: Pick<Storage,'getItem'|'setItem'>
  constructor(storage: Pick<Storage,'getItem'|'setItem'>) { this.storage=storage }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getSnapshot = () => this.snapshot
  hasBackup = () => this.storage.getItem(STORAGE_KEY) !== null
  private publish() {
    this.snapshot = this.data ? JSON.stringify({ unlocked:true, count:this.data.notes.length }) : 'locked'
    this.listeners.forEach(listener => listener())
  }
  lock = () => { this.epoch++; this.passphrase=null; this.data=null; this.publish() }
  async unlock(passphrase: string) {
    const epoch = ++this.epoch
    const backup = this.storage.getItem(STORAGE_KEY)
    const data = backup ? validate(await decryptNotes(backup,passphrase)) : empty()
    // For a new vault, validate and persist the password-protected empty envelope.
    const serialized = backup ? null : await encryptNotes(JSON.stringify(data),passphrase)
    if (epoch !== this.epoch) throw new Error('Vault was locked during unlock.')
    if (serialized) this.storage.setItem(STORAGE_KEY,serialized)
    this.data=data; this.passphrase=passphrase; this.publish()
  }
  listRecords(): Omit<RecoveryNote,'secret'|'blinding'>[] {
    if (!this.data) throw new Error('Unlock the vault first.')
    return this.data.notes.map(({network,pool,commitment,amount})=>({network,pool,commitment,amount}))
  }
  recoveryNote(network: RecoveryNote['network'], pool: string, commitment: string): RecoveryNote | undefined {
    if (!this.data) throw new Error('Unlock the vault first.')
    const note = this.data.notes.find(note => note.network === network && note.pool === pool && note.commitment === commitment)
    return note ? { ...note } : undefined
  }
  exportEncrypted = () => {
    const backup=this.storage.getItem(STORAGE_KEY)
    if (!backup) throw new Error('Create or restore a vault first.')
    return backup
  }
  async restore(serialized: string, passphrase: string) {
    if (this.hasBackup()) throw new Error('An existing vault is present. Restore in a separate browser profile to avoid overwriting notes.')
    const epoch=++this.epoch
    const data=validate(await decryptNotes(serialized,passphrase))
    if (epoch!==this.epoch) throw new Error('Vault was locked during restore.')
    this.storage.setItem(STORAGE_KEY,serialized)
    this.data=data;this.passphrase=passphrase;this.publish()
  }
  async saveRecoveryNote(note: RecoveryNote) {
    if (!this.data || !this.passphrase) throw new Error('Unlock the vault first.')
    if (this.writing) throw new Error('A vault write is already in progress.')
    this.writing=true
    const epoch=this.epoch
    try {
      const data=validate(JSON.stringify({version:1,notes:[...this.data.notes,note]}))
      const serialized=await encryptNotes(JSON.stringify(data),this.passphrase)
      if(epoch!==this.epoch) throw new Error('Vault was locked during save.')
      this.storage.setItem(STORAGE_KEY,serialized)
      this.data=data;this.publish()
    } finally {this.writing=false}
  }
}
let instance: NoteVaultSession | undefined
export const noteVault = () => instance ??= new NoteVaultSession(window.localStorage)
export const lockNoteVault = () => instance?.lock()
