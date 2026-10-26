import {createWalletClient,custom,type Address,type Hex,type Hash} from 'viem'
import {sepolia} from 'viem/chains'
import {publicClient} from './eth'
type Saved={account:Address;to:Address;data:Hex;pending:boolean;hash?:Hash}
const key=(id:string)=>`zkross:evm-operation:v1:${id}`
export async function expectedEvmWallet(account:Address){
 if(!window.ethereum)throw new Error('Ouvre le site dans un navigateur avec MetaMask.')
 const wallet=createWalletClient({account,chain:sepolia,transport:custom(window.ethereum)})
 if(await wallet.getChainId()!==11155111||!(await wallet.getAddresses()).some(a=>a.toLowerCase()===account.toLowerCase()))throw new Error('Connecte le portefeuille Ethereum attendu sur Sepolia.')
 return wallet
}
export async function recoverEvmSubmission(id:string,hash:Hash){
 const raw=window.localStorage.getItem(key(id));if(!raw)throw new Error('Aucune opération à récupérer.');const saved=JSON.parse(raw) as Saved
 if(!saved.pending||saved.hash)throw new Error('Cette opération ne nécessite pas de récupération de hash.')
 const tx=await publicClient.getTransaction({hash})
 if(tx.from.toLowerCase()!==saved.account.toLowerCase()||tx.to?.toLowerCase()!==saved.to.toLowerCase()||tx.input.toLowerCase()!==saved.data.toLowerCase())throw new Error('Ce hash ne correspond pas à la demande sauvegardée.')
 saved.hash=hash;window.localStorage.setItem(key(id),JSON.stringify(saved))
}
export async function submitEvm(id:string,account:Address,to:Address,data:Hex,onHash?:(hash:Hash)=>void){
 if(!navigator.locks)throw new Error('Ce navigateur ne permet pas de protéger les opérations entre onglets.')
 return navigator.locks.request(key(id),{ifAvailable:true},async lock=>{
  if(!lock)throw new Error('Cette opération est déjà en cours dans un autre onglet.')
  const raw=window.localStorage.getItem(key(id));const saved:Saved=raw?JSON.parse(raw):{account,to,data,pending:false}
  if(saved.account.toLowerCase()!==account.toLowerCase()||saved.to.toLowerCase()!==to.toLowerCase()||saved.data.toLowerCase()!==data.toLowerCase())throw new Error('La demande diffère du journal de reprise.')
  if(!saved.hash){
   if(saved.pending)throw new Error(`Soumission incertaine (${id}). Importe le hash MetaMask avant de reprendre.`)
   const wallet=await expectedEvmWallet(account)
   await publicClient.call({account,to,data})
   const gas=await publicClient.estimateGas({account,to,data})
   saved.pending=true;window.localStorage.setItem(key(id),JSON.stringify(saved))
   try{saved.hash=await wallet.sendTransaction({account,chain:sepolia,to,data,gas:gas*120n/100n});window.localStorage.setItem(key(id),JSON.stringify(saved))}catch(error){
    const rejected=(value:unknown):boolean=>!!value&&typeof value==='object'&&(('code'in value&&value.code===4001)||('cause'in value&&rejected(value.cause)))
    if(rejected(error)){saved.pending=false;window.localStorage.setItem(key(id),JSON.stringify(saved))}throw error
   }
  }
  onHash?.(saved.hash)
  const tx=await publicClient.getTransaction({hash:saved.hash})
  if(tx.from.toLowerCase()!==account.toLowerCase()||tx.to?.toLowerCase()!==to.toLowerCase()||tx.input.toLowerCase()!==data.toLowerCase())throw new Error('Transaction Ethereum non conforme au journal.')
  const receipt=await publicClient.waitForTransactionReceipt({hash:saved.hash,confirmations:2,timeout:180000})
  if(receipt.status!=='success')throw new Error(`La transaction a échoué : ${saved.hash}. Les fonds ne doivent pas être envoyés à nouveau sans réconciliation.`)
  return receipt
 })
}
