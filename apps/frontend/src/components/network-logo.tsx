import type { NetworkId } from '../lib/mock-bridge'
import { cn } from '../lib/utils'

type NetworkLogoProps = {
  network: NetworkId
  className?: string
  inverse?: boolean
}

function NetworkLogo({ network, className, inverse = false }: NetworkLogoProps) {
  if (network === 'ethereum') {
    return (
      <img
        src="/brand/ethereum.svg"
        alt=""
        aria-hidden="true"
        className={cn('object-contain', className)}
      />
    )
  }

  return (
    <span aria-hidden="true" className={cn('relative inline-block', className)}>
      <img
        src={inverse ? '/brand/stellar-black.svg' : '/brand/stellar-white.svg'}
        alt=""
        className="stellar-theme-dark absolute inset-0 size-full object-contain"
      />
      <img
        src={inverse ? '/brand/stellar-white.svg' : '/brand/stellar-black.svg'}
        alt=""
        className="stellar-theme-light absolute inset-0 size-full object-contain"
      />
    </span>
  )
}

function NetworkMark({ network, className }: { network: NetworkId; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-2xl border',
        network === 'ethereum'
          ? 'border-accent/30 bg-accent/10 text-accent'
          : 'border-foreground/15 bg-foreground text-background',
        className,
      )}
    >
      <NetworkLogo network={network} inverse={network === 'stellar'} className="size-[54%]" />
    </span>
  )
}

function NetworkRouteMark({
  className,
  from = 'ethereum',
  to = 'stellar',
}: {
  className?: string
  from?: NetworkId
  to?: NetworkId
}) {
  return (
    <span className={cn('inline-flex items-center', className)} aria-label={`${from} to ${to}`}>
      <NetworkMark network={from} className="size-7 rounded-lg" />
      <span className="-ml-1.5 rounded-full border border-background bg-surface px-1 text-[8px] text-subtle">→</span>
      <NetworkMark network={to} className="-ml-1.5 size-7 rounded-lg" />
    </span>
  )
}

export { NetworkLogo, NetworkMark, NetworkRouteMark }
