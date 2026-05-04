import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type { Point } from '@whiteboard/core/types'
import type {
  SceneHit,
  SceneHitItem,
  SceneSpatial,
  SceneVisibility
} from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'

export const DEFAULT_HIT_THRESHOLD = 8

const readGroupDistance = (input: {
  state: WorkingState
  groupId: string
  point: Point
}): number | undefined => {
  const bounds = input.state.graph.owners.groups.get(input.groupId)?.frame.bounds
  if (!bounds) {
    return undefined
  }

  return geometryApi.rect.containsPoint(input.point, bounds)
    ? 0
    : geometryApi.rect.distanceToPoint(input.point, bounds)
}

export const createHitRead = (input: {
  state: () => WorkingState
  spatial: SceneSpatial
  visibility: SceneVisibility
}): SceneHit => ({
  node: ({
    point,
    threshold,
    excludeIds
  }) => {
    const topmost = input.visibility.point({
      point,
      threshold: threshold ?? DEFAULT_HIT_THRESHOLD,
      exclude: excludeIds?.length
        ? {
            node: excludeIds
          }
        : undefined
    }).topmost

    return topmost?.kind === 'node'
      ? topmost.id
      : undefined
  },
  edge: ({
    point,
    threshold,
    excludeIds
  }) => {
    const topmost = input.visibility.point({
      point,
      threshold: threshold ?? DEFAULT_HIT_THRESHOLD,
      exclude: excludeIds?.length
        ? {
            edge: excludeIds
          }
        : undefined
    }).topmost

    return topmost?.kind === 'edge'
      ? topmost.id
      : undefined
  },
  item: ({
    point,
    threshold,
    kinds,
    exclude
  }) => {
    const kindSet = kinds
      ? new Set(kinds)
      : undefined
    const topmost = input.visibility.point({
      point,
      threshold: threshold ?? DEFAULT_HIT_THRESHOLD,
      exclude: {
        node: exclude?.node,
        edge: exclude?.edge,
        mindmap: exclude?.mindmap
      }
    }).topmost

    if (topmost && (!kindSet || kindSet.has(topmost.kind))) {
      return topmost
    }

    if (!kindSet || kindSet.has('group')) {
      const state = input.state()
      let winner: {
        target: SceneHitItem
        distance: number
      } | undefined

      state.graph.owners.groups.forEach((group, groupId) => {
        if (exclude?.group?.includes(groupId)) {
          return
        }

        const distance = readGroupDistance({
          state,
          groupId,
          point
        })
        if (distance === undefined || distance > (threshold ?? DEFAULT_HIT_THRESHOLD)) {
          return
        }

        if (!winner || distance < winner.distance) {
          winner = {
            target: {
              kind: 'group',
              id: groupId
            },
            distance
          }
        }
      })

      return winner?.target
    }

    return undefined
  }
})
