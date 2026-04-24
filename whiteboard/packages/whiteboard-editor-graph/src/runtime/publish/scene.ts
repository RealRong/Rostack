import { createFlags, type Flags } from '@shared/projection-runtime'
import type { SceneSnapshot } from '../../contracts/editor'
import type { ScenePublishDelta } from '../../contracts/delta'
import type { WorkingState } from '../../contracts/working'

export const patchPublishedScene = (input: {
  previous: SceneSnapshot
  working: WorkingState
  delta: ScenePublishDelta
}): {
  value: SceneSnapshot
  change: Flags
} => {
  const changed = input.delta.items || input.delta.visible

  if (!changed) {
    return {
      value: input.previous,
      change: createFlags(false)
    }
  }

  return {
    value: {
      layers: input.previous.layers,
      items: input.delta.items
        ? input.working.scene.items
        : input.previous.items,
      visible: input.delta.visible
        ? input.working.scene.visible
        : input.previous.visible,
      spatial: input.delta.visible
        ? input.working.scene.spatial
        : input.previous.spatial,
      pick: input.delta.visible
        ? input.working.scene.pick
        : input.previous.pick
    },
    change: createFlags(true)
  }
}
