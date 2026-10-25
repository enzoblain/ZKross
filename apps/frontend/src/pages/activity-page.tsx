import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  FileClock,
  LoaderCircle,
  Play,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { NetworkMark, NetworkRouteMark } from '../components/network-logo'
import { Button } from '../components/ui/button'
import { useWallets } from '../components/wallet-context'
import { formatMessage } from '../lib/amounts'
import { runTransfer } from '../lib/bridge-flow'
import { explorer, isDeployed } from '../lib/config'
import { networkMeta } from '../lib/networks'
import * as store from '../lib/store'
import type { Transfer, TransferStatus } from '../lib/store'
import { cn } from '../lib/utils'
import { truncateAddress } from '../lib/wallet-adapters'

const statusCopy: Record<TransferStatus, { label: string; tone: string }> = {
  created: { label: 'Created', tone: 'text-muted' },
  deposited: { label: 'Deposited', tone: 'text-accent' },
  sent: { label: 'Bridge out sent', tone: 'text-accent' },
  rootPosted: { label: 'Remote root posted', tone: 'text-accent' },
  claimed: { label: 'Claimed', tone: 'text-success' },
  withdrawn: { label: 'Withdrawn', tone: 'text-success' },
  refunded: { label: 'Refunded', tone: 'text-warning' },
}

const txNetwork = (transfer: Transfer, key: keyof Transfer['txs']) =>
  key === 'approve' || key === 'deposit' || key === 'bridgeOut' ? transfer.from : transfer.to

const txLabel: Record<keyof Transfer['txs'], string> = {
  approve: 'Approval',
  deposit: 'Deposit',
  bridgeOut: 'Bridge out',
  bridgeIn: 'Claim',
  trustline: 'Trustline',
  withdraw: 'Withdrawal',
}

function ActivityPage() {
  const { wallets } = useWallets()
  const [transfers, setTransfers] = useState(() => store.transfers())
  const [runningId, setRunningId] = useState<string | null>(null)
  const [progressText, setProgressText] = useState('')
  const [resumeError, setResumeError] = useState('')
  const [exported, setExported] = useState(false)

  useEffect(() => store.subscribe(() => setTransfers(store.transfers())), [])

  const exportBackup = () => {
    const blob = new Blob([store.exportRecords()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `zkross-notes-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setExported(true)
  }

  const canResume = (transfer: Transfer) =>
    transfer.status !== 'withdrawn' &&
    transfer.status !== 'refunded' &&
    wallets[transfer.from]?.address === transfer.sender &&
    wallets[transfer.to]?.address === transfer.claimer &&
    isDeployed(transfer.from) &&
    isDeployed(transfer.to)

  const resume = async (transfer: Transfer) => {
    setRunningId(transfer.id)
    setResumeError('')
    setProgressText('Unlocking transfer…')
    try {
      await runTransfer(transfer, (_step, _status, description) => {
        if (description) setProgressText(description)
      })
      setProgressText('Transfer complete')
    } catch (error) {
      setResumeError(error instanceof Error ? error.message : String(error))
    } finally {
      setRunningId(null)
      setTransfers(store.transfers())
    }
  }

  return (
    <div className="page-enter">
      <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent"><NetworkRouteMark />Local transfer records</p>
          <h1 className="mt-4 text-balance text-4xl font-medium tracking-[-0.055em] sm:text-5xl">A trace you control.</h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-muted">Every transfer below comes from this browser’s local note store. On-chain actions link to the relevant explorer; unfinished flows can resume after a reload.</p>
        </div>
        <Button variant="secondary" onClick={exportBackup}><Download aria-hidden="true" />Export notes backup</Button>
      </div>

      <div className="mt-8 flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/[0.045] p-4 text-[11px] leading-5 text-muted">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        <p><strong className="text-foreground">Keep a backup.</strong> Until encrypted note delivery and recovery are implemented, clearing this site’s data can remove the blindings and claim secrets required to use unspent notes. The backup contains sensitive records but no wallet spending key.</p>
      </div>
      {exported && <p role="status" className="mt-3 flex items-center gap-2 text-[10px] text-success"><CheckCircle2 aria-hidden="true" className="size-3.5" />Backup downloaded</p>}

      {resumeError && <div role="alert" className="mt-5 rounded-2xl border border-danger/25 bg-danger/[0.055] p-4 text-[11px] leading-5 text-danger">{resumeError}</div>}

      <section className="mt-8 overflow-hidden rounded-[2rem] border border-border bg-surface" aria-labelledby="history-title">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
          <div><h2 id="history-title" className="text-base font-semibold tracking-[-0.02em]">Transfers</h2><p className="mt-1 text-xs text-subtle">{transfers.length} record{transfers.length === 1 ? '' : 's'} in this browser</p></div>
          {runningId && <span className="flex items-center gap-2 text-[10px] text-accent"><LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />{progressText}</span>}
        </div>

        {transfers.length === 0 ? (
          <div className="grid min-h-80 place-items-center p-8 text-center">
            <div className="max-w-sm"><span className="mx-auto grid size-14 place-items-center rounded-full border border-border bg-background text-subtle"><FileClock aria-hidden="true" className="size-5" /></span><h3 className="mt-6 text-lg font-semibold">No transfers yet</h3><p className="mt-3 text-sm leading-6 text-muted">Start a testnet bridge flow and its locally stored notes, status, and transaction links will appear here.</p></div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {transfers.map((transfer) => {
              const status = statusCopy[transfer.status]
              const resumable = canResume(transfer)
              const isRunning = runningId === transfer.id
              return (
                <article key={transfer.id} className="p-5 sm:p-7">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex items-center gap-2"><NetworkMark network={transfer.from} className="size-9 rounded-xl" /><ArrowRight aria-hidden="true" className="size-3.5 text-subtle" /><NetworkMark network={transfer.to} className="size-9 rounded-xl" /></div>
                      <div className="min-w-0"><p className="text-sm font-semibold">{formatMessage(BigInt(transfer.amount))} USDC</p><p className="mt-1 text-[10px] text-subtle">{networkMeta[transfer.from].shortName} → {networkMeta[transfer.to].shortName} · {new Date(transfer.createdAt).toLocaleString()}</p><p className="mt-2 truncate font-mono text-[10px] text-muted">To {truncateAddress(transfer.recipient)}</p></div>
                    </div>
                    <div className="flex items-center gap-3 sm:flex-col sm:items-end"><span className={cn('rounded-full border border-border bg-background px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em]', status.tone)}>{status.label}</span>{transfer.error && <span className="max-w-xs text-[10px] text-danger sm:text-right">{transfer.error}</span>}</div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    {(Object.entries(transfer.txs) as [keyof Transfer['txs'], string][]).map(([key, hash]) => (
                      <a key={`${key}:${hash}`} href={explorer.tx(txNetwork(transfer, key), hash)} target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/45 px-2.5 py-1.5 text-[10px] font-medium text-accent hover:border-accent/30">{txLabel[key]} · {truncateAddress(hash)}<ExternalLink aria-hidden="true" className="size-3" /></a>
                    ))}
                    {transfer.status !== 'withdrawn' && transfer.status !== 'refunded' && (
                      <Button variant="secondary" size="sm" className="ml-auto" disabled={!resumable || Boolean(runningId)} onClick={() => void resume(transfer)}>{isRunning ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Play aria-hidden="true" />}{!isDeployed(transfer.from) || !isDeployed(transfer.to) ? 'Awaiting Sepolia pool' : !resumable ? 'Connect both wallets' : 'Resume'}</Button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-border bg-background/35 p-4 text-[11px] leading-5 text-muted"><ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" /><p>Explorer links show public transaction boundaries only. The local record also contains the private continuity needed to resume; it is not an independent on-chain audit log.</p></div>
    </div>
  )
}

export { ActivityPage }
