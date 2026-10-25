import { describe, expect, it } from 'vitest'

import { progressFor } from './cctp-flow'
import type { CctpTransfer } from './cctp-store'

const transfer = (status: CctpTransfer['status']): CctpTransfer => ({
  id: 'test',
  mode: 'simulation',
  from: 'ethereum',
  to: 'stellar',
  amount: '1000000',
  sourceAddress: 'demo:ethereum',
  privacyId: 'zkr_test',
  createdAt: 1,
  updatedAt: 1,
  status,
  events: [],
})

describe('CCTP progress', () => {
  it('starts with every stage idle', () => {
    expect(progressFor('ethereum', 'stellar', transfer('created')).every((step) => step.status === 'idle')).toBe(true)
  })

  it('marks burn and all earlier stages complete', () => {
    expect(progressFor('ethereum', 'stellar', transfer('burned')).map((step) => step.status)).toEqual([
      'complete',
      'complete',
      'complete',
      'complete',
      'idle',
      'idle',
      'idle',
    ])
  })

  it('finishes with a private note rather than a public withdrawal', () => {
    const steps = progressFor('stellar', 'ethereum', transfer('private'))
    expect(steps.at(-1)?.label).toBe('Create the destination note')
    expect(steps.every((step) => step.status === 'complete')).toBe(true)
  })
})
