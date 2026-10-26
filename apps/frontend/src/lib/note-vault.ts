/** Experimental browser-local encrypted vault primitive. No server/key escrow.
 * Real execution remains blocked until wallet lifecycle integration is verified.
 * A strong independent passphrase is required; wallet public signatures are not keys.
 */
const ITERATIONS = 600_000
const CONTEXT = new TextEncoder().encode('ZKross encrypted notes v1')
export type VaultEnvelope = {
  version: 1; kdf: 'PBKDF2-SHA256'; iterations: number; salt: string; iv: string; ciphertext: string
}
const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
function decode(value: unknown, limit: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || value.length > limit || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Invalid vault encoding.')
  return Uint8Array.from(atob(value), char => char.charCodeAt(0))
}
async function key(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  if (passphrase.length < 12) throw new Error('Use a strong vault passphrase of at least 12 characters.')
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
export async function encryptNotes(records: string, passphrase: string): Promise<string> {
  if (records.length > 2_000_000) throw new Error('Vault is too large.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: CONTEXT }, await key(passphrase, salt), new TextEncoder().encode(records))
  const envelope: VaultEnvelope = { version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) }
  return JSON.stringify(envelope)
}
export async function decryptNotes(serialized: string, passphrase: string): Promise<string> {
  if (serialized.length > 4_000_000) throw new Error('Vault is too large.')
  const envelope: unknown = JSON.parse(serialized)
  if (!envelope || typeof envelope !== 'object' || !('version' in envelope) || envelope.version !== 1 || !('kdf' in envelope) || envelope.kdf !== 'PBKDF2-SHA256' || !('iterations' in envelope) || envelope.iterations !== ITERATIONS) throw new Error('Unsupported vault format.')
  const data = envelope as VaultEnvelope
  const salt = decode(data.salt, 32), iv = decode(data.iv, 24), ciphertext = decode(data.ciphertext, 3_000_000)
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) throw new Error('Invalid vault envelope.')
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: CONTEXT }, await key(passphrase, salt), ciphertext)
  return new TextDecoder('utf-8', { fatal: true }).decode(plaintext)
}
