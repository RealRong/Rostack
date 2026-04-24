import { scheduler } from '@shared/core'

export const now = (): number => scheduler.readMonotonicNow()
