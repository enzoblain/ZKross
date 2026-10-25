import { cn } from '../lib/utils'

type BrandMarkProps = { className?: string }

function BrandMark({ className }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex items-baseline text-[15px] font-semibold leading-none tracking-[-0.075em] text-foreground',
        className,
      )}
    >
      ZKR<span className="text-accent">Ø</span>SS
    </span>
  )
}

export { BrandMark }
