// The "experimental" setting: shows Enzo's CCTP pages next to the main
// liquidity-bridge pages. Off by default; remembered in this browser only.
import type { PageId } from '../App'

const KEY = 'zkross-experimental'

export const experimentalPages: PageId[] = [
  'cctp-bridge',
  'private-balance',
  'cctp-activity',
  'cctp-privacy',
  'cctp-compliance',
]

export function readExperimental(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

export function writeExperimental(enabled: boolean) {
  try {
    window.localStorage.setItem(KEY, enabled ? 'on' : 'off')
  } catch {
    // Storage blocked: the setting lasts for this visit only.
  }
}
