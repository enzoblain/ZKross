import { motion } from 'motion/react'

import { cn } from '../../lib/utils'

type SpotlightProps = {
  className?: string
}

// A restrained, pointer-free adaptation of Aceternity UI's spotlight pattern.
function Spotlight({ className }: SpotlightProps) {
  return (
    <motion.div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute -right-32 -top-44 h-[32rem] w-[32rem] rounded-full opacity-0 blur-3xl',
        className,
      )}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 0.22, scale: 1 }}
      transition={{ duration: 1.2, ease: 'easeOut' }}
      style={{
        background:
          'radial-gradient(circle, rgba(196,181,253,0.30) 0%, rgba(196,181,253,0.08) 34%, transparent 70%)',
      }}
    />
  )
}

export { Spotlight }
