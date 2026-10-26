import { NoteVaultPanel } from '../components/note-vault-panel'
import { useSyncExternalStore } from 'react'
import { privateBalance, subscribe } from '../lib/cctp-store'
import { formatMessage } from '../lib/amounts'
import { networkMeta, type NetworkId } from '../lib/networks'

export function PrivateBalancePage() {
  const eth = useSyncExternalStore(subscribe, () => privateBalance('ethereum'), () => 0n)
  const stellar = useSyncExternalStore(subscribe, () => privateBalance('stellar'), () => 0n)
  return <div className="mx-auto max-w-2xl space-y-6"><h1 className="text-4xl font-medium">Private wallet</h1><p className="text-sm text-muted">Simulation balances only. These browser-local demo notes have no on-chain value and contain no real spending secrets.</p><div className="grid gap-4 sm:grid-cols-2">{(['ethereum', 'stellar'] as NetworkId[]).map(network => <section key={network} className="rounded-3xl border border-border bg-surface p-6"><h2>{networkMeta[network].name}</h2><p className="mt-3 text-2xl">{formatMessage(network === 'ethereum' ? eth : stellar)} USDC</p><p className="mt-2 text-xs text-warning">Simulated</p></section>)}</div><NoteVaultPanel/><p className="text-sm text-muted">Real private balances are unavailable until compatible privacy pools, encrypted note storage, and verified deposits are integrated. Losing real private notes can permanently lose access to funds.</p></div>
}
