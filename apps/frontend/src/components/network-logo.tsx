import type { SVGProps } from 'react'

import type { NetworkId } from '../lib/mock-bridge'
import { cn } from '../lib/utils'

type NetworkLogoProps = SVGProps<SVGSVGElement> & {
  network: NetworkId
}

function NetworkLogo({ network, className, ...props }: NetworkLogoProps) {
  if (network === 'ethereum') {
    return (
      <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className={className} {...props}>
        <path d="M16 2.8 7.2 16 16 21.1 24.8 16 16 2.8Z" fill="currentColor" opacity=".95" />
        <path d="m7.2 16 8.8 5.1 8.8-5.1L16 11.9 7.2 16Z" fill="currentColor" opacity=".55" />
        <path d="M16 22.8 7.5 17.9 16 29.2l8.5-11.3-8.5 4.9Z" fill="currentColor" opacity=".82" />
      </svg>
    )
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className={className} {...props}>
      <circle cx="16" cy="16" r="9.5" stroke="currentColor" strokeWidth="2.3" />
      <path d="M4.8 20.7 27.2 10.2M6.7 24.5l18.6-8.7" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
    </svg>
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
      <NetworkLogo network={network} className="size-[54%]" />
    </span>
  )
}

function NetworkRouteMark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center', className)} aria-label="Ethereum to Stellar">
      <NetworkMark network="ethereum" className="size-7 rounded-lg" />
      <span className="-ml-1.5 rounded-full border border-background bg-surface px-1 text-[8px] text-subtle">→</span>
      <NetworkMark network="stellar" className="-ml-1.5 size-7 rounded-lg" />
    </span>
  )
}

export { NetworkLogo, NetworkMark, NetworkRouteMark }
