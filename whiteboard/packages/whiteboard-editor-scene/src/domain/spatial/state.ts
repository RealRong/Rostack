import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type {
  Point,
  Rect
} from '@whiteboard/core/types'
import type {
  SpatialKey,
  SpatialRecord,
  SpatialTree
} from './contracts'

const createSpatialTree = (): SpatialTree => {
  const bounds = new Map<SpatialKey, Rect>()

  return {
    insert: (record) => {
      bounds.set(record.key, record.bounds)
    },
    update: (previous, next) => {
      if (previous.key !== next.key) {
        bounds.delete(previous.key)
      }
      bounds.set(next.key, next.bounds)
    },
    remove: (record) => {
      bounds.delete(record.key)
    },
    rect: (rect) => {
      const keys: SpatialKey[] = []

      bounds.forEach((boundsRect, key) => {
        if (geometryApi.rect.intersects(boundsRect, rect)) {
          keys.push(key)
        }
      })

      return keys
    },
    point: (point) => {
      const keys: SpatialKey[] = []

      bounds.forEach((boundsRect, key) => {
        if (geometryApi.rect.containsPoint(point, boundsRect)) {
          keys.push(key)
        }
      })

      return keys
    }
  }
}

export interface SpatialIndexState {
  records: Map<SpatialKey, SpatialRecord>
  orderByKey: Map<SpatialKey, number>
  tree: SpatialTree
}

export const createSpatialState = (): SpatialIndexState => ({
  records: new Map(),
  orderByKey: new Map(),
  tree: createSpatialTree()
})

export const resetSpatialState = (
  state: SpatialIndexState
) => {
  state.records.clear()
  state.orderByKey.clear()
  state.tree = createSpatialTree()
}
