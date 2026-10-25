import { motion } from 'motion/react'

import { cn } from '../../lib/utils'

type SpotlightProps = {
  className?: string
}

// Adapted as a restrained, pointer-free variant of Aceternity UI's spotlight.
function Spotlight({ className }: SpotlightProps) {
  return (
    <motion.div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute -right-28 -top-40 h-[30rem] w-[30rem] rounded-full opacity-0 blur-3xl',
        className,
      )}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 0.22, scale: 1 }}
      transition={{ duration: 1.2, ease: 'easeOut' }}
      style={{
        background:
          'radial-gradient(circle, rgba(196,181,253,0.32) 0%, rgba(196,181,253,0.08) 34%, transparent 68%)',
      }}
    />
  )
}

export { Spotlight }
