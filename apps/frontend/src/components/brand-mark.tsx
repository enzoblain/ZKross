import { cn } from '../lib/utils'

type BrandMarkProps = { className?: string }

function BrandMark({ className }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative grid size-8 place-items-center overflow-hidden rounded-[10px] border border-border-strong bg-surface-raised',
        className,
      )}
    >
      <span className="absolute left-[7px] h-[18px] w-[2px] -rotate-[31deg] rounded-full bg-foreground" />
      <span className="absolute right-[7px] h-[18px] w-[2px] rotate-[31deg] rounded-full bg-accent" />
      <span className="absolute h-[2px] w-3 rounded-full bg-accent" />
    </span>
  )
}

export { BrandMark }
