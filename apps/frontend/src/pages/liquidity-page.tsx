import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Droplets,
  Info,
  LoaderCircle,
  LockKeyhole,
  WalletCards,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { NetworkMark, NetworkRouteMark } from '../components/network-logo'
import { Button } from '../components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { useWallets } from '../components/wallet-context'
import { WalletConnectDialog } from '../components/wallet-connect-dialog'
import { networkMeta, type NetworkId } from '../lib/mock-bridge'
import { cn } from '../lib/utils'
import { truncateAddress } from '../lib/wallet-adapters'

type LiquidityView = 'provide' | 'positions'

function LiquidityPage() {
  const { wallets, connecting } = useWallets()
  const [view, setView] = useState<LiquidityView>('provide')
  const [walletDialogNetwork, setWalletDialogNetwork] = useState<NetworkId | null>(null)
  const [amount, setAmount] = useState('1000')
  const [allocation, setAllocation] = useState(50)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)

  const numericAmount = Number.parseFloat(amount) || 0
  const split = useMemo(
    () => ({
      ethereum: (numericAmount * allocation) / 100,
      stellar: (numericAmount * (100 - allocation)) / 100,
    }),
    [allocation, numericAmount],
  )
  const walletsReady = Boolean(wallets.ethereum && wallets.stellar)
  const canReview = walletsReady && numericAmount > 0
  const missingWallet: NetworkId | null = !wallets.ethereum
    ? 'ethereum'
    : !wallets.stellar
      ? 'stellar'
      : null

  return (
    <div className="page-enter">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            <NetworkRouteMark />
            Liquidity providing
          </p>
          <h1 className="mt-4 text-balance text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
            Fund the route. Keep the risk legible.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted">
            Compose a balanced USDC liquidity intent across Ethereum Sepolia and Stellar
            Testnet. Pool contracts and deposits are not connected yet.
          </p>
        </div>
        <span className="w-fit rounded-full border border-warning/25 bg-warning/[0.055] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-warning">
          Local intent only
        </span>
      </div>

      <div className="mt-10 grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <section className="overflow-hidden rounded-[2rem] border border-border bg-surface" aria-labelledby="liquidity-card-title">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
            <div>
              <h2 id="liquidity-card-title" className="text-base font-semibold tracking-[-0.02em]">
                Liquidity workspace
              </h2>
              <p className="mt-1 text-xs text-subtle">No APY or available capacity is fabricated.</p>
            </div>
            <div role="tablist" aria-label="Liquidity views" className="flex rounded-xl border border-border bg-background p-1">
              {[
                ['provide', 'Provide'],
                ['positions', 'Positions'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id as LiquidityView)}
                  className={cn(
                    'focus-ring rounded-lg px-3 py-2 text-[10px] font-medium',
                    view === id ? 'bg-surface-raised text-foreground' : 'text-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {view === 'provide' ? (
            <div className="space-y-6 p-5 sm:p-7">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-muted">Wallets used for this route</p>
                  <span className="text-[9px] text-subtle">Both required only for liquidity</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(['ethereum', 'stellar'] as NetworkId[]).map((network) => {
                    const wallet = wallets[network]
                    const isConnecting = connecting === network
                    return (
                      <button
                        key={network}
                        type="button"
                        onClick={() => setWalletDialogNetwork(network)}
                        className="focus-ring flex min-h-17 items-center gap-3 rounded-2xl border border-border bg-background/50 px-3.5 text-left hover:border-border-strong"
                      >
                        <NetworkMark network={network} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[10px] text-subtle">
                            {networkMeta[network].wallet} · {networkMeta[network].name}
                          </span>
                          <span className="mt-1 block truncate text-xs font-medium">
                            {wallet
                              ? truncateAddress(wallet.address)
                              : isConnecting
                                ? 'Waiting for wallet…'
                                : 'Connect wallet'}
                          </span>
                        </span>
                        {isConnecting ? (
                          <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-accent" />
                        ) : wallet ? (
                          <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
                        ) : (
                          <WalletCards aria-hidden="true" className="size-4 text-subtle" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <p className="mb-3 text-xs font-medium text-muted">Route</p>
                <div className="rounded-3xl border border-accent/35 bg-accent/[0.045] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <NetworkMark network="ethereum" />
                      <div>
                        <p className="text-sm font-medium">Ethereum Sepolia</p>
                        <p className="mt-1 text-[10px] text-subtle">USDC source reserve</p>
                      </div>
                    </div>
                    <ArrowRight aria-hidden="true" className="size-4 text-subtle" />
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <p className="text-sm font-medium">Stellar Testnet</p>
                        <p className="mt-1 text-[10px] text-subtle">USDC release reserve</p>
                      </div>
                      <NetworkMark network="stellar" />
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-subtle">
                  Reverse-route liquidity remains unavailable until reverse bridging is supported.
                </p>
              </div>

              <div>
                <label htmlFor="liquidity-amount" className="mb-2.5 block text-xs font-medium text-muted">
                  Total liquidity amount
                </label>
                <div className="flex items-center rounded-2xl border border-border bg-background/50 px-4 focus-within:border-accent/55 focus-within:ring-2 focus-within:ring-accent/10">
                  <input
                    id="liquidity-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))}
                    className="min-w-0 flex-1 bg-transparent py-4 text-2xl font-medium tracking-[-0.035em] outline-none"
                    placeholder="0.00"
                  />
                  <span className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold">USDC</span>
                </div>
                <p className="mt-2 text-[10px] text-subtle">
                  Wallet balances are not read until token adapters are implemented.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-background/35 p-4">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="allocation-range" className="font-medium text-muted">
                    Ethereum reserve allocation
                  </label>
                  <span className="font-mono">{allocation}%</span>
                </div>
                <input
                  id="allocation-range"
                  type="range"
                  min="25"
                  max="75"
                  step="5"
                  value={allocation}
                  onChange={(event) => setAllocation(Number(event.target.value))}
                  className="mt-4 h-1.5 w-full cursor-pointer accent-accent"
                />
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <p className="text-[9px] text-subtle">Ethereum allocation</p>
                    <p className="mt-1 font-mono text-xs">{split.ethereum.toLocaleString()} USDC</p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <p className="text-[9px] text-subtle">Stellar allocation</p>
                    <p className="mt-1 font-mono text-xs">{split.stellar.toLocaleString()} USDC</p>
                  </div>
                </div>
              </div>

              <Button
                variant="accent"
                size="lg"
                className="w-full"
                disabled={walletsReady && !canReview}
                onClick={() => missingWallet ? setWalletDialogNetwork(missingWallet) : setReviewOpen(true)}
              >
                <Droplets aria-hidden="true" />
                {walletsReady
                  ? 'Review liquidity intent'
                  : `Connect ${networkMeta[missingWallet ?? 'ethereum'].wallet} for liquidity`}
              </Button>
              <p className="text-center text-[10px] leading-4 text-subtle">
                This cannot deposit, approve, mint LP shares, or calculate yield.
              </p>
            </div>
          ) : (
            <div className="grid min-h-[470px] place-items-center p-7 text-center">
              {draftSaved ? (
                <div className="max-w-sm">
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent/10 text-accent">
                    <CircleDollarSign aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="mt-6 text-lg font-semibold">Local draft saved</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    {numericAmount.toLocaleString()} USDC · {allocation}/{100 - allocation} split.
                    This is not an LP position and has no on-chain value.
                  </p>
                  <Button variant="secondary" className="mt-6" onClick={() => setView('provide')}>
                    Edit intent
                  </Button>
                </div>
              ) : (
                <div className="max-w-sm">
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-border bg-background text-subtle">
                    <Droplets aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="mt-6 text-lg font-semibold">No liquidity positions</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    Real positions require deployed pool contracts, indexed balances, and
                    wallet-signed deposit transactions.
                  </p>
                  <Button variant="secondary" className="mt-6" onClick={() => setView('provide')}>
                    Compose an intent
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className="rounded-3xl border border-border bg-surface p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent">
                <Droplets aria-hidden="true" className="size-4" />
              </span>
              <div>
                <p className="text-xs font-semibold">Provisioning readiness</p>
                <p className="mt-1 text-[10px] text-subtle">Current implementation boundary</p>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              {[
                ['Wallet authorization', 'Available'],
                ['Pool contracts', 'Not connected'],
                ['USDC approvals', 'Not connected'],
                ['LP share accounting', 'Not connected'],
                ['Yield calculation', 'Unavailable'],
              ].map(([label, status]) => (
                <div key={label} className="flex items-center justify-between gap-4 text-[11px]">
                  <span className="text-muted">{label}</span>
                  <span className={status === 'Available' ? 'text-success' : 'text-subtle'}>{status}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-warning/20 bg-warning/[0.045] p-5">
            <div className="flex items-start gap-3">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p className="text-xs font-medium">Liquidity risk</p>
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  Production must expose contract risk, smart-contract audits, withdrawal
                  constraints, fees, utilization, and loss scenarios from real data.
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review liquidity intent</DialogTitle>
            <DialogDescription>
              Save this allocation as a local draft. No token approval, signature,
              deposit, or LP position will be created.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-border bg-background/50 p-5">
            <dl className="space-y-4 text-xs">
              <div className="flex justify-between gap-4"><dt className="text-subtle">Total</dt><dd className="font-mono">{numericAmount.toLocaleString()} USDC</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Ethereum reserve</dt><dd className="font-mono">{split.ethereum.toLocaleString()} USDC</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Stellar reserve</dt><dd className="font-mono">{split.stellar.toLocaleString()} USDC</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-subtle">Pool contracts</dt><dd className="text-warning">Unavailable</dd></div>
            </dl>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/[0.055] p-4 text-[11px] leading-5 text-muted">
            <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            Connected wallets expose public addresses only. They are not asked to sign this draft.
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <DialogClose asChild><Button variant="secondary">Back to edit</Button></DialogClose>
            <Button
              variant="accent"
              onClick={() => {
                setDraftSaved(true)
                setView('positions')
                setReviewOpen(false)
              }}
            >
              Save local draft
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <WalletConnectDialog
        network={walletDialogNetwork}
        open={Boolean(walletDialogNetwork)}
        onOpenChange={(open) => !open && setWalletDialogNetwork(null)}
        purpose="liquidity"
      />
    </div>
  )
}

export { LiquidityPage }
