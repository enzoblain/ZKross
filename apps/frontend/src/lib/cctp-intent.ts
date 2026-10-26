import { bytesToHex, hexToBytes, pad, parseAbi, type Address, type Hex } from 'viem'
import { StrKey } from '@stellar/stellar-sdk'
import { cctpTestnet, stellarForwarding } from './cctp-wire'

/** Public settlement intent only: never place private-note secrets in CCTP hooks. */
export type SepoliaStellarIntent = {
  sourceAccount: Address
  recipient: string
  amount: bigint
  maxFee: bigint
}
export const tokenMessengerV2Abi = parseAbi([
  'function depositForBurnWithHook(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,address burnToken,bytes32 destinationCaller,uint256 maxFee,uint32 minFinalityThreshold,bytes hookData)',
])
export const sepoliaUsdc = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as const
const word = (address: Address) => pad(address, { size: 32 }).toLowerCase() as Hex
const stellarWord = (address: string) => bytesToHex(StrKey.decodeContract(address)).toLowerCase() as Hex
function checkIntent(intent: SepoliaStellarIntent) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(intent.sourceAccount) || BigInt(intent.sourceAccount) === 0n) throw new Error('Invalid source account.')
  if (!StrKey.isValidEd25519PublicKey(intent.recipient)) throw new Error('This route requires a Stellar account with a USDC trustline.')
  if (intent.amount <= 0n || intent.amount >= 1n << 256n || intent.maxFee < 0n || intent.maxFee >= intent.amount) throw new Error('Invalid USDC amount or fee cap.')
}
/** Unsigned standard-finality burn request. It is not a readiness check or an execution API. */
export function prepareSepoliaBurn(intent: SepoliaStellarIntent) {
  checkIntent(intent)
  const forwarding = stellarForwarding(intent.recipient)
  return {
    chainId: 11155111,
    account: intent.sourceAccount,
    address: cctpTestnet.sepolia.messenger,
    abi: tokenMessengerV2Abi,
    functionName: 'depositForBurnWithHook',
    args: [intent.amount, 27, forwarding.mintRecipient, sepoliaUsdc, forwarding.destinationCaller, intent.maxFee, 2000, forwarding.hookData],
  } as const
}

/** Binds every immutable settlement field to the wallet-authorized intent.
 * This does not authenticate a message: Circle's on-chain transmitter still must
 * verify signatures/replay protection. Recipient trustline and successful mint
 * require separate chain reads. Only finalized (standard) messages are accepted.
 */
export function validateSepoliaStellarMessage(message: Hex, intent: SepoliaStellarIntent) {
  checkIntent(intent)
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(message)) throw new Error('Invalid CCTP message bytes.')
  const data = hexToBytes(message)
  if (data.length < 376) throw new Error('Truncated CCTP burn message.')
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const uint32 = (offset: number) => view.getUint32(offset, false)
  const field = (offset: number) => bytesToHex(data.slice(offset, offset + 32)).toLowerCase() as Hex
  const integer = (offset: number) => BigInt(field(offset))
  const forwarding = stellarForwarding(intent.recipient)
  const equal = (condition: boolean, fieldName: string) => { if (!condition) throw new Error(`CCTP intent mismatch: ${fieldName}.`) }
  equal(uint32(0) === 1 && uint32(148) === 1, 'version')
  equal(uint32(4) === 0 && uint32(8) === 27, 'route')
  equal(integer(12) !== 0n, 'nonce')
  equal(field(44) === word(cctpTestnet.sepolia.messenger), 'source messenger')
  equal(field(76) === stellarWord(cctpTestnet.stellar.messenger), 'destination messenger')
  equal(field(108) === forwarding.destinationCaller.toLowerCase(), 'destination caller')
  equal(uint32(140) === 2000 && uint32(144) >= 2000, 'finality')
  equal(field(152) === word(sepoliaUsdc), 'USDC asset')
  equal(field(184) === forwarding.mintRecipient.toLowerCase(), 'mint recipient')
  equal(integer(216) === intent.amount, 'amount')
  equal(field(248) === word(intent.sourceAccount), 'source account')
  equal(integer(280) === intent.maxFee, 'fee cap')
  const fee = integer(312)
  equal(fee <= intent.maxFee && fee < intent.amount, 'executed fee')
  equal(bytesToHex(data.slice(376)).toLowerCase() === forwarding.hookData.toLowerCase(), 'forwarding hook')
  return { nonce: field(12), grossAmount: intent.amount, fee, netAmount: intent.amount - fee, expirationBlock: integer(344) }
}
