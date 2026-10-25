import { cn } from '../lib/utils'

type BrandMarkProps = {
  className?: string
}

function BrandMark({ className }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative grid size-8 place-items-center rounded-[10px] border border-border-strong bg-surface-raised',
        className,
      )}
    >
      <span className="absolute h-3.5 w-[1px] -rotate-45 bg-accent" />
      <span className="absolute h-3.5 w-[1px] rotate-45 bg-foreground/70" />
    </span>
  )
}

export { BrandMark }
