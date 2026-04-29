import { entityDelta } from '@shared/delta'
import type { Document } from '@whiteboard/core/types'
import type { Revision } from '@shared/projection'
import type {
  ItemsDelta,
  SceneItemEntry,
  SceneItemKey
} from '../../contracts/delta'
import {
  sceneItemKey
} from '../../contracts/delta'
import type { WorkingState } from '../../contracts/working'

type DocumentSnapshot = {
  revision: Revision
  document: Document
}

const toSceneItem = (
  ref: Document['canvas']['order'][number]
): SceneItemEntry => ({
  key: sceneItemKey.write(ref),
  kind: ref.kind,
  id: ref.id
})

const buildItemsSnapshot = (
  snapshot: DocumentSnapshot
): WorkingState['items'] => {
  const byId = new Map<SceneItemKey, SceneItemEntry>()
  const ids = snapshot.document.canvas.order.map((ref) => {
    const item = toSceneItem(ref)
    byId.set(item.key, item)
    return item.key
  })

  return {
    ids,
    byId
  }
}

export const patchItemsState = (input: {
  revision: number
  snapshot: DocumentSnapshot
  working: WorkingState
  reset: boolean
}): {
  changed: boolean
  count: number
} => {
  const previous = input.working.items
  const next = buildItemsSnapshot(input.snapshot)
  const change = entityDelta.fromSnapshots({
    previousIds: previous.ids,
    nextIds: next.ids,
    previousGet: (key) => previous.byId.get(key),
    nextGet: (key) => next.byId.get(key)
  })

  input.working.delta.items = {
    revision: input.revision,
    change
  }

  if (input.reset || change) {
    input.working.items = next
  }

  return {
    changed: input.reset || change !== undefined,
    count: (change?.set?.length ?? 0) + (change?.remove?.length ?? 0)
  }
}
