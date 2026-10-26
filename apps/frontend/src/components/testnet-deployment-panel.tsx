import { useState } from 'react'
import type { Address,Hash } from 'viem'
import { Button } from './ui/button'
import { useWallets } from './wallet-context'
import { deploySepoliaPrivatePool,deploymentOrder,loadDeployment,recoverDeployment,type DeploymentJournal,type DeploymentName } from '../lib/sepolia-deployment'
export function TestnetDeploymentPanel(){
 const {wallets,connectWallet}=useWallets()
 const account=wallets.ethereum?.address as Address|undefined
 const [journal,setJournal]=useState<DeploymentJournal|null>(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[recoveryHash,setRecoveryHash]=useState('')
 const [recoveryStep,setRecoveryStep]=useState<DeploymentName>('Poseidon2')
 const displayed=journal?.account.toLowerCase()===account?.toLowerCase()?journal:null
 async function deploy(){if(!account || busy)return;setBusy(true);setError('');try{await deploySepoliaPrivatePool(account,setJournal)}catch(reason){setError(reason instanceof Error?reason.message:String(reason))}finally{setBusy(false)}}
 async function recover(){if(!account)return;setBusy(true);try{setJournal(await recoverDeployment(account,recoveryStep,recoveryHash as Hash));setError('')}catch(reason){setError(reason instanceof Error?reason.message:String(reason))}finally{setBusy(false)}}
 function exportManifest(){if(!displayed)return;const url=URL.createObjectURL(new Blob([JSON.stringify(displayed,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='zkross-sepolia-deployment.json';link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <section className="space-y-4 rounded-3xl border border-border bg-surface p-6"><h2 className="text-xl font-medium">Sepolia deployment</h2><p className="text-sm text-muted">Operator setup. Deploys the experimental private pool without a Global View Key and its verifier. Your wallet signs four contract creations and pays testnet ETH. This does not move USDC or activate the bridge by itself.</p>
 {!account?<Button onClick={()=>void connectWallet('ethereum')}>Connect MetaMask</Button>:<><p className="break-all font-mono text-xs">Signer: {account}</p><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void deploy()}>{busy?'Waiting for signatures or confirmations…':'Deploy or resume on Sepolia'}</Button><Button variant="secondary" disabled={busy} onClick={()=>{try{setJournal(loadDeployment(account));setError('')}catch(reason){setError(String(reason))}}}>Load deployment history</Button></div></>}
 <ol className="space-y-3">{deploymentOrder.map(name=><li key={name} className="text-sm"><span>{name} · {displayed?.steps[name]?.address?'Confirmed':displayed?.steps[name]?.hash?'Submitted':displayed?.steps[name]?.pending?'Submission uncertain':'Not deployed'}</span>{displayed?.steps[name]?.hash&&<a className="ml-2 text-accent" target="_blank" rel="noreferrer" href={`https://sepolia.etherscan.io/tx/${displayed.steps[name]!.hash}`}>View transaction</a>}</li>)}</ol>
 {displayed&&<Button variant="secondary" onClick={exportManifest}>Export public deployment manifest</Button>}
 <details><summary className="cursor-pointer text-sm">Recover an uncertain submission</summary><p className="mt-2 text-xs text-muted">If the wallet submitted a transaction before the browser lost its response, paste that hash. The sender and deployment bytecode must match the saved request.</p><label className="block text-sm">Contract<select className="m-2 rounded border border-border bg-background p-2" value={recoveryStep} onChange={event=>setRecoveryStep(event.target.value as DeploymentName)}>{deploymentOrder.map(name=><option key={name}>{name}</option>)}</select></label><label className="block text-sm">Transaction hash<input className="mt-2 block w-full rounded border border-border bg-background p-2" value={recoveryHash} onChange={event=>setRecoveryHash(event.target.value)}/></label><Button variant="secondary" disabled={!account||busy||!/^0x[0-9a-fA-F]{64}$/.test(recoveryHash)} onClick={()=>void recover()}>Validate saved submission</Button></details>
 {error&&<p role="alert" className="text-sm text-danger">{error}</p>}</section>
}
