import { createWalletClient,custom,erc20Abi,parseAbi,parseEventLogs,type Abi,type Address,type Hash,type Hex } from 'viem'
import { sepolia } from 'viem/chains'
import { assertPinnedRuntime,type PinnedRuntime } from './runtime-pin'
import { publicClient } from './eth'
import { sepoliaUsdc } from './cctp-intent'
import { ethereumPrivateProof } from './private-proof'
import type { Proved } from './zk/types'
export type EthereumPrivateExt={recipient:Address;extAmount:bigint;encryptedOutput0:Hex;encryptedOutput1:Hex}
const views=parseAbi(['function token() view returns(address)','function verifier() view returns(address)','function levels() view returns(uint32)','function getRoot() view returns(uint256)','function isSpent(uint256) view returns(bool)'])
const adapterViews=parseAbi(['function target() view returns(address)','function nPublic() view returns(uint256)'])
async function artifact(){return (await import('./deployment-artifacts.json')).default.PrivateUsdcPool as {abi:Abi}}
export async function assertEthereumPrivatePool(pool:Address){
 if(await publicClient.getChainId()!==11155111)throw new Error('Private pool RPC is not Sepolia.')
 const [token,verifier,levels]=await Promise.all([publicClient.readContract({address:pool,abi:views,functionName:'token'}),publicClient.readContract({address:pool,abi:views,functionName:'verifier'}),publicClient.readContract({address:pool,abi:views,functionName:'levels'})])
 if(token.toLowerCase()!==sepoliaUsdc.toLowerCase()||levels!==20)throw new Error('Private pool token or tree depth is incompatible.')
 const count=await publicClient.readContract({address:verifier,abi:adapterViews,functionName:'nPublic'})
 if(count!==7n)throw new Error('Pool uses an incompatible or legacy GVK verifier.')
 const target=await publicClient.readContract({address:verifier,abi:adapterViews,functionName:'target'})
 const pinned=(await import('./deployment-artifacts.json')).default
 assertPinnedRuntime(await publicClient.getBytecode({address:target}),pinned.PolicyTx22Verifier.runtime as PinnedRuntime)
 assertPinnedRuntime(await publicClient.getBytecode({address:verifier}),pinned.SnarkjsVerifierAdapter.runtime as PinnedRuntime)
 const libraries=assertPinnedRuntime(await publicClient.getBytecode({address:pool}),pinned.PrivateUsdcPool.runtime as PinnedRuntime)
 if(libraries.length!==1)throw new Error('Unexpected Poseidon library links.')
 for(const library of libraries)assertPinnedRuntime(await publicClient.getBytecode({address:library as Address}),pinned.Poseidon2.runtime as PinnedRuntime,true)
 return {token,verifier,target}
}
export const ethereumPrivateRoot=(pool:Address)=>publicClient.readContract({address:pool,abi:views,functionName:'getRoot'})
export async function ethereumPrivateExtHash(pool:Address,ext:EthereumPrivateExt):Promise<Hex>{
 return await publicClient.readContract({address:pool,abi:(await artifact()).abi,functionName:'hashExtData',args:[ext]}) as Hex
}
async function signer(account:Address){
 if(!window.ethereum)throw new Error('MetaMask is not available in this browser.')
 const wallet=createWalletClient({account,chain:sepolia,transport:custom(window.ethereum)})
 if(await wallet.getChainId()!==11155111||!(await wallet.getAddresses()).some(a=>a.toLowerCase()===account.toLowerCase()))throw new Error('Connect the expected Sepolia wallet account.')
 return wallet
}
async function confirm(hash:Hash){const receipt=await publicClient.waitForTransactionReceipt({hash,confirmations:1,timeout:120_000});if(receipt.status!=='success')throw new Error(`Sepolia transaction reverted: ${hash}`);return receipt}
/** Caller journals the deposit intent and encrypted note BEFORE invoking this.
 * onSubmitted persists real hashes immediately; a lost response requires recovery.
 */
export async function sendEthereumPrivateTransaction(account:Address,pool:Address,proof:Proved,ext:EthereumPrivateExt,onSubmitted:(kind:'approval'|'pool',hash:Hash)=>void){
 await assertEthereumPrivatePool(pool)
 const args=ethereumPrivateProof(proof),abi=(await artifact()).abi
 if(ext.extAmount>0n){
  const allowance=await publicClient.readContract({address:sepoliaUsdc,abi:erc20Abi,functionName:'allowance',args:[account,pool]})
  if(allowance<ext.extAmount){
   const wallet=await signer(account)
   const simulated=await publicClient.simulateContract({account,address:sepoliaUsdc,abi:erc20Abi,functionName:'approve',args:[pool,ext.extAmount]})
   const hash=await wallet.writeContract(simulated.request);onSubmitted('approval',hash);await confirm(hash)
  }
 }
 const wallet=await signer(account)
 const simulation=await publicClient.simulateContract({account,address:pool,abi,functionName:'transact',args:[args,ext]})
 const hash=await wallet.writeContract(simulation.request);onSubmitted('pool',hash)
 const receipt=await confirm(hash)
 const events=parseEventLogs({abi,logs:receipt.logs,eventName:'NewCommitment',strict:true})
 return {hash,receipt,events}
}
