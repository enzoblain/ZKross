import { useSyncExternalStore } from 'react'
import { subscribe, exportRecords } from '../lib/cctp-store'

export function CctpActivityPage() {
  const snapshot = useSyncExternalStore(subscribe, exportRecords, () => '{"transfers":[],"notes":[]}')
  const data = JSON.parse(snapshot) as { transfers: { id: string; mode: string; status: string; events: { id: string; label: string; detail: string }[] }[] }
  return <div className="mx-auto max-w-2xl space-y-6"><h1 className="text-4xl font-medium">Transaction activity</h1><p className="text-sm text-muted">Browser-local simulation history. This is not an on-chain confirmation feed or an authenticated private transaction index.</p>{data.transfers.filter(t => t.mode === 'simulation').map(t => <section key={t.id} className="rounded-3xl border border-border p-6"><h2>Simulated · {t.status}</h2><ol className="mt-4 space-y-3">{t.events.map(e => <li key={e.id}><p className="text-sm">{e.label}</p><p className="text-xs text-muted">{e.detail}</p></li>)}</ol></section>)}</div>
}
