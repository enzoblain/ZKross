import { describe, expect, it } from 'vitest'
import { decryptNotes, encryptNotes } from './note-vault'
const password = 'independent test-only passphrase'
describe('encrypted note recovery primitive', () => {
  it('round trips records while hiding their secrets', async () => {
    const records = JSON.stringify({ secret: 'private-blinding', amount: '123' })
    const backup = await encryptNotes(records, password)
    expect(backup).not.toContain('private-blinding')
    expect(await decryptNotes(backup, password)).toBe(records)
  })
  it('uses fresh random salt and nonce for each backup', async () => {
    const a = JSON.parse(await encryptNotes('notes', password))
    const b = JSON.parse(await encryptNotes('notes', password))
    expect(a.iv).not.toBe(b.iv); expect(a.salt).not.toBe(b.salt)
  })
  it('rejects wrong passwords and modified ciphertext', async () => {
    const backup = await encryptNotes('notes', password)
    await expect(decryptNotes(backup, 'different strong passphrase')).rejects.toThrow()
    const data = JSON.parse(backup)
    data.ciphertext = (data.ciphertext[0] === 'A' ? 'B' : 'A') + data.ciphertext.slice(1)
    await expect(decryptNotes(JSON.stringify(data), password)).rejects.toThrow()
  })
  it('rejects unsupported KDF costs before expensive work', async () => {
    await expect(decryptNotes(JSON.stringify({ version: 1, kdf: 'PBKDF2-SHA256', iterations: 9999999999 }), password)).rejects.toThrow('Unsupported')
  })
  it('refuses weak passwords', async () => {
    await expect(encryptNotes('notes', 'short')).rejects.toThrow('passphrase')
  })
})
