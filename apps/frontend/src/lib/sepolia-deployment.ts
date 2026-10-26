import { createWalletClient,custom,encodeDeployData,type Abi,type Address,type Hash } from 'viem'
import { sepolia } from 'viem/chains'
import { publicClient } from './eth'
import { linkBytecode,type LinkReferences } from './bytecode-linker'
import { stellarForwarding } from './cctp-wire'
import { sepoliaUsdc } from './cctp-intent'
export const deploymentOrder=['Poseidon2','PolicyTx22Verifier','SnarkjsVerifierAdapter','PrivateUsdcPool','CctpBatcher'] as const
export type DeploymentName=typeof deploymentOrder[number]
type Step={pending?:boolean;hash?:Hash;address?:Address;data?:`0x${string}`}
export type DeploymentJournal={version:1;chainId:11155111;account:Address;steps:Partial<Record<DeploymentName,Step>>;error?:string}
const key=(account:string)=>`zkross:deployment:sepolia:v1:${account.toLowerCase()}`
export function loadDeployment(account:Address):DeploymentJournal {
 const raw=window.localStorage.getItem(key(account))
 if(!raw)return {version:1,chainId:11155111,account,steps:{}}
 const journal=JSON.parse(raw) as DeploymentJournal
 if(journal.version!==1 || journal.chainId!==11155111 || journal.account.toLowerCase()!==account.toLowerCase())throw new Error('Invalid deployment journal.')
 return journal
}
function save(journal:DeploymentJournal){window.localStorage.setItem(key(journal.account),JSON.stringify(journal))}
const running=new Set<string>()
async function wallet(account:Address){
 if(!window.ethereum)throw new Error('Open this page in a browser with MetaMask installed.')
 const client=createWalletClient({account,chain:sepolia,transport:custom(window.ethereum)})
 if(await client.getChainId()!==11155111)throw new Error('Switch the wallet to Ethereum Sepolia.')
 const accounts=await client.getAddresses()
 if(!accounts.some(value=>value.toLowerCase()===account.toLowerCase()))throw new Error('The connected wallet account changed.')
 return client
}
export async function recoverDeployment(account:Address,name:DeploymentName,hash:Hash){
 const journal=loadDeployment(account),step=journal.steps[name]
 if(!step?.pending || !step.data || step.hash)throw new Error('No uncertain deployment is waiting for a hash.')
 const transaction=await publicClient.getTransaction({hash})
 if(transaction.from.toLowerCase()!==account.toLowerCase() || transaction.to || transaction.input.toLowerCase()!==step.data.toLowerCase())throw new Error('This hash does not match the saved deployment request.')
 step.hash=hash;save(journal)
 return journal
}
/** Wallet signatures only. Each request is journaled before submission. A missing
 * submission outcome is never retried automatically. No seed/private key access.
 */
export async function deploySepoliaPrivatePool(account:Address,update:(journal:DeploymentJournal)=>void){
 if(running.has(account.toLowerCase()))throw new Error('A deployment is already running.')
 const journal=loadDeployment(account)
 running.add(account.toLowerCase())
 const publish=()=>{save(journal);update(structuredClone(journal))}
 try{
  await wallet(account)
  if(await publicClient.getChainId()!==11155111)throw new Error('RPC is not Sepolia.')
  if(!await publicClient.getBytecode({address:sepoliaUsdc}))throw new Error('Official Sepolia USDC contract is absent.')
  const artifacts=(await import('./deployment-artifacts.json')).default as Record<DeploymentName,{abi:Abi;bytecode:string;linkReferences:LinkReferences}>
  for(const name of deploymentOrder){
   const artifact=artifacts[name]
   const libs:Record<string,string>=journal.steps.Poseidon2?.address?{Poseidon2:journal.steps.Poseidon2.address}:{}
   const bytecode=linkBytecode(artifact.bytecode,artifact.linkReferences,libs)
   const args=name==='CctpBatcher'?[sepoliaUsdc,'0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',stellarForwarding('CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ').mintRecipient]:name==='SnarkjsVerifierAdapter'?[journal.steps.PolicyTx22Verifier?.address,7n]:name==='PrivateUsdcPool'?[sepoliaUsdc,journal.steps.SnarkjsVerifierAdapter?.address]:[]
   const data=encodeDeployData({abi:artifact.abi,bytecode,args})
   const step=journal.steps[name]??={}
   if(step.data && step.data!==data)throw new Error('Saved deployment differs from this build. Reconcile the previous deployment first.')
   if(step.address && !step.hash)throw new Error('A saved contract address has no deployment receipt.')
   if(!step.hash){
    if(step.pending)throw new Error(`Submission of ${name} is uncertain. Import its transaction hash before resuming.`)
    const client=await wallet(account)
    const gas=await publicClient.estimateGas({account,data})
    const gasPrice=await publicClient.getGasPrice()
    if(await publicClient.getBalance({address:account})<gas*gasPrice*2n)throw new Error('Insufficient Sepolia ETH for this deployment and gas margin.')
    step.data=data;step.pending=true;publish()
    try{step.hash=await client.sendTransaction({account,chain:sepolia,data,gas:gas*120n/100n});publish()}
    catch(error){
     const code=error && typeof error==='object' && 'code' in error?Number(error.code):undefined
     if(code===4001){step.pending=false;publish()}
     throw error
    }
   }
   const transaction=await publicClient.getTransaction({hash:step.hash})
   if(transaction.from.toLowerCase()!==account.toLowerCase() || transaction.to || transaction.input.toLowerCase()!==data.toLowerCase())throw new Error('Deployment transaction does not match its saved request.')
   const receipt=await publicClient.waitForTransactionReceipt({hash:step.hash,confirmations:1,timeout:120_000})
   if(receipt.status!=='success' || !receipt.contractAddress)throw new Error(`${name} deployment reverted. Keep the transaction hash for inspection.`)
   if(step.address && step.address.toLowerCase()!==receipt.contractAddress.toLowerCase())throw new Error('Saved address differs from its deployment receipt.')
   if(!await publicClient.getBytecode({address:receipt.contractAddress}))throw new Error(`Deployed ${name} code is no longer present.`)
   step.address=receipt.contractAddress;step.pending=false;delete journal.error;publish()
  }
  return journal
 }catch(error){journal.error=error instanceof Error?error.message:String(error);publish();throw error}
 finally{running.delete(account.toLowerCase())}
}
