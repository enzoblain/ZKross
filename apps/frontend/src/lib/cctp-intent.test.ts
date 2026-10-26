import { describe, expect, it } from 'vitest'
import { StrKey } from '@stellar/stellar-sdk'
import { bytesToHex, hexToBytes, pad, type Hex } from 'viem'
import { prepareSepoliaBurn, sepoliaUsdc, validateSepoliaStellarMessage } from './cctp-intent'
import { cctpTestnet, stellarForwarding } from './cctp-wire'
const intent = { sourceAccount: `0x${'11'.repeat(20)}` as Hex, recipient: StrKey.encodeEd25519PublicKey(new Uint8Array(32).fill(3)), amount: 1_000_000n, maxFee: 100n }
function fixture() {
  const forwarding = stellarForwarding(intent.recipient)
  const hook = hexToBytes(forwarding.hookData)
  const data = new Uint8Array(376 + hook.length)
  const view = new DataView(data.buffer)
  for (const [offset, value] of [[0,1],[4,0],[8,27],[140,2000],[144,2000],[148,1]]) view.setUint32(offset,value)
  const put = (offset: number, value: Hex) => data.set(hexToBytes(pad(value, { size: 32 })),offset)
  put(12,'0x01'); put(44,cctpTestnet.sepolia.messenger)
  put(76,bytesToHex(StrKey.decodeContract(cctpTestnet.stellar.messenger)))
  put(108,forwarding.destinationCaller); put(152,sepoliaUsdc); put(184,forwarding.mintRecipient)
  put(216,'0x0f4240'); put(248,intent.sourceAccount); put(280,'0x64'); put(312,'0x32')
  data.set(hook,376)
  return data
}
describe('CCTP wallet intent binding', () => {
  it('prepares a standard-finality burn with both forwarder fields', () => {
    const burn = prepareSepoliaBurn(intent)
    expect(burn.args[2]).toBe(burn.args[4]); expect(burn.args[6]).toBe(2000)
    expect(burn.args[3]).toBe(sepoliaUsdc)
  })
  it('reconciles gross burn, fee and net mint', () => {
    const result = validateSepoliaStellarMessage(bytesToHex(fixture()),intent)
    expect(result.netAmount).toBe(999_950n)
    expect(result.netAmount + result.fee).toBe(result.grossAmount)
  })
  it.each([0,4,8,12,44,76,108,140,144,148,152,184,216,248,280,312,376])('rejects a mutation at byte %s', offset => {
    const data = fixture()
    // Zero the nonce; mutate all other immutable fields or executed fee.
    if (offset === 12) data.fill(0,12,44)
    else if (offset === 144) new DataView(data.buffer).setUint32(144,1000)
    else data[offset] ^= 1
    expect(() => validateSepoliaStellarMessage(bytesToHex(data),intent)).toThrow()
  })
  it('refuses trailing integrator payload not authorized by the intent', () => {
    const original = fixture(); const data = new Uint8Array(original.length+1); data.set(original)
    expect(() => validateSepoliaStellarMessage(bytesToHex(data),intent)).toThrow('hook')
  })
  it('refuses malformed/truncated bytes', () => {
    for (const message of ['0xabc','0xgg','0x00']) expect(() => validateSepoliaStellarMessage(message as Hex,intent)).toThrow()
  })
  it('rejects zero amounts, excessive fees and invalid recipients before burn preparation', () => {
    for (const input of [{...intent,amount:0n},{...intent,maxFee:intent.amount},{...intent,recipient:'Ginvalid'}]) expect(() => prepareSepoliaBurn(input)).toThrow()
  })
})
