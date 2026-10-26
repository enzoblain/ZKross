import { CheckCircle2, ExternalLink, LoaderCircle, ShieldCheck, Unplug } from 'lucide-react'

import { networkMeta, type NetworkId } from '../lib/networks'
import { truncateAddress } from '../lib/wallet-adapters'
import { NetworkMark } from './network-logo'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { useWallets } from './wallet-context'

const installUrls: Record<NetworkId, string> = {
  ethereum: 'https://metamask.io/download/',
  stellar: 'https://www.freighter.app/',
}

type WalletConnectDialogProps = {
  network: NetworkId | null
  open: boolean
  onOpenChange: (open: boolean) => void
  purpose?: 'required' | 'destination' | 'optional' | 'liquidity'
}

function WalletConnectDialog({
  network,
  open,
  onOpenChange,
  purpose = 'required',
}: WalletConnectDialogProps) {
  const { wallets, connecting, errors, connectWallet, disconnectWallet } = useWallets()
  if (!network) return null

  const meta = networkMeta[network]
  const wallet = wallets[network]
  const isConnecting = connecting === network
  const purposeCopy = {
    required: 'This source wallet authorizes the private intake and the CCTP transfer in live testnet mode.',
    destination: 'Optional: connect this wallet only when you want to withdraw a private destination note publicly.',
    optional: 'Optional: use this public address for a later withdrawal. A second wallet is not required to bridge.',
    liquidity: 'Connect the pool admin wallet for this chain. Only the admin can add liquidity to the pool.',
  }[purpose]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-3 flex items-center gap-3">
            <NetworkMark network={network} className="size-12" />
            <div>
              <DialogTitle>{wallet ? `${meta.wallet} connected` : `Connect ${meta.wallet}`}</DialogTitle>
              <p className="mt-1 text-[10px] text-subtle">{meta.name}</p>
            </div>
          </div>
          <DialogDescription>{purposeCopy}</DialogDescription>
        </DialogHeader>

        {wallet ? (
          <div className="rounded-2xl border border-success/20 bg-success/[0.055] p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-success">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              Public address authorized
            </div>
            <p className="mt-3 break-all font-mono text-[11px] text-muted">{wallet.address}</p>
            <p className="mt-2 text-[10px] text-subtle">{wallet.networkLabel}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-background/45 p-4 text-[11px] leading-5 text-muted">
            <div className="flex items-start gap-3">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
              <p>
                Zkross requests the public account now. During a transfer, it asks the wallet
                to derive a note key and approve testnet transactions. It never asks for a seed phrase or private key.
              </p>
            </div>
          </div>
        )}

        {errors[network] && (
          <div role="alert" aria-live="polite" className="rounded-2xl border border-danger/25 bg-danger/[0.055] p-4 text-[11px] leading-5 text-danger">
            {errors[network]}
          </div>
        )}

        <div className="grid gap-2">
          {wallet ? (
            <Button
              variant="secondary"
              onClick={() => {
                disconnectWallet(network)
                onOpenChange(false)
              }}
            >
              <Unplug aria-hidden="true" />
              Disconnect {truncateAddress(wallet.address)}
            </Button>
          ) : (
            <Button variant="accent" disabled={Boolean(connecting)} onClick={() => void connectWallet(network)}>
              {isConnecting ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <NetworkMark network={network} className="size-6 rounded-md border-0" />}
              {isConnecting ? `Waiting for ${meta.wallet}…` : `Connect ${meta.wallet}`}
            </Button>
          )}
          <Button asChild variant="ghost" size="sm">
            <a href={installUrls[network]} target="_blank" rel="noreferrer">
              Install or open the official wallet
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
        </div>

        <p className="text-center text-[9px] leading-4 text-subtle">
          Browser extensions may be unavailable inside an embedded browser. If nothing opens,
          use Chrome, Brave, Firefox, or Edge with the extension installed.
        </p>
      </DialogContent>
    </Dialog>
  )
}

export { WalletConnectDialog }
