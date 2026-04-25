import { store } from '@shared/core'
import type { SceneItem } from '@whiteboard/editor-scene'

export const readSceneItemKey = (
  item: SceneItem | {
    kind: SceneItem['kind']
    id: string
  }
) => `${item.kind}:${item.id}`

export const createSceneOrder = (input: {
  items: store.ReadStore<readonly SceneItem[]>
}) => {
  const index = store.createDerivedStore<Map<string, number>>({
    get: () => new Map(
      store.read(input.items).map((item, order) => [readSceneItemKey(item), order] as const)
    ),
    isEqual: (left, right) => left === right
  })

  return {
    index,
    get: (
      item: SceneItem | {
        kind: SceneItem['kind']
        id: string
      }
    ) => store.read(index).get(readSceneItemKey(item)) ?? -1
  }
}
