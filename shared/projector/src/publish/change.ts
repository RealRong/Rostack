import type { Flags } from '../contracts/core'

export const createFlags = (
  changed: boolean
): Flags => ({
  changed
})
