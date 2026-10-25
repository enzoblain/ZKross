import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-foreground text-background shadow-[0_1px_0_color-mix(in_srgb,var(--foreground)_24%,transparent)_inset] hover:opacity-90 active:scale-[0.99]',
        accent:
          'bg-accent text-white shadow-[0_1px_0_rgba(255,255,255,0.28)_inset] hover:bg-accent-strong active:scale-[0.99]',
        secondary:
          'border border-border bg-surface text-foreground hover:border-border-strong hover:bg-surface-raised',
        ghost: 'text-muted hover:bg-surface-raised hover:text-foreground',
        danger:
          'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/15',
      },
      size: {
        default: 'h-11 px-4',
        sm: 'h-9 rounded-lg px-3 text-xs',
        lg: 'h-12 px-5',
        icon: 'size-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button'

  return (
    <Component
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button }
