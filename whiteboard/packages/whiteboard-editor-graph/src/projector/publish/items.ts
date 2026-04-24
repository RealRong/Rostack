import { createFlags, type Flags } from '@shared/projector'
import type { SceneItem } from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'

export const patchPublishedItems = (input: {
  previous: readonly SceneItem[]
  working: WorkingState
  changed: boolean
}): {
  value: readonly SceneItem[]
  change: Flags
} => {
  if (!input.changed) {
    return {
      value: input.previous,
      change: createFlags(false)
    }
  }

  return {
    value: input.working.items,
    change: createFlags(true)
  }
}
