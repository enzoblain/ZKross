import {useState} from 'react'
import {Button} from './ui/button'
import {useWallets} from './wallet-context'
import {deployStellarPrivatePool,loadStellarDeployment,stellarDeploymentOrder,type StellarDeploymentJournal} from '../lib/stellar-deployment'
export function StellarDeploymentPanel(){
 const {wallets,connectWallet}=useWallets(),source=wallets.stellar?.address
 const [journal,setJournal]=useState<StellarDeploymentJournal|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const displayed=journal?.source===source?journal:null
 async function deploy(){if(!source||busy)return;setBusy(true);setError('');try{await deployStellarPrivatePool(source,setJournal)}catch(reason){setError(reason instanceof Error?reason.message:String(reason))}finally{setBusy(false)}}
 function download(){if(!displayed)return;const url=URL.createObjectURL(new Blob([JSON.stringify(displayed,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='zkross-stellar-deployment.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <section className="space-y-4 rounded-3xl border border-border bg-surface p-6"><h2 className="text-xl font-medium">Stellar deployment</h2><p className="text-sm text-muted">Operator setup. Freighter signs the uploads and creations of four pinned contracts. The new pool uses the open policy circuit without a Global View Key and the official testnet USDC token. Testnet XLM pays the deployment fees. This does not activate bridging by itself.</p>
 {!source?<Button onClick={()=>void connectWallet('stellar')}>Connect Freighter</Button>:<><p className="break-all font-mono text-xs">Signer: {source}</p><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void deploy()}>{busy?'Waiting for Freighter or confirmation…':'Deploy or resume on Stellar Testnet'}</Button><Button disabled={busy} variant="secondary" onClick={()=>{try{setJournal(loadStellarDeployment(source));setError('')}catch(reason){setError(String(reason))}}}>Load deployment history</Button></div></>}
 <ol className="space-y-3">{stellarDeploymentOrder.map(name=><li key={name} className="text-sm">{name} · {displayed?.steps[name]?.address?'Confirmed':displayed?.steps[name]?.creationHash?'Creation submitted':displayed?.steps[name]?.uploadHash?'Upload submitted':'Not deployed'}{displayed?.steps[name]?.creationHash&&<a className="ml-2 text-accent" target="_blank" rel="noreferrer" href={`https://stellar.expert/explorer/testnet/tx/${displayed.steps[name]!.creationHash}`}>View transaction</a>}</li>)}</ol>
 {displayed&&<Button variant="secondary" onClick={download}>Export public deployment manifest</Button>}
 {error&&<p role="alert" className="text-sm text-danger">{error}</p>}</section>
}
