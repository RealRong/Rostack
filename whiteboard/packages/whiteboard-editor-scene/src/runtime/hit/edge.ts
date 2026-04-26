import { edge as edgeApi } from '@whiteboard/core/edge'
import type {
  EdgeId,
  Point
} from '@whiteboard/core/types'
import type { Read } from '../../contracts/editor'
import type {
  GraphState
} from '../../contracts/working'

const DEFAULT_THRESHOLD = 8

const toRect = (
  point: Point,
  radius: number
) => ({
  x: point.x - radius,
  y: point.y - radius,
  width: radius * 2,
  height: radius * 2
})

export const createEdgeHitRead = (input: {
  graph: () => GraphState
  spatial: Read['spatial']
}): Read['hit']['edge'] => ({
  point,
  threshold,
  excludeIds
}) => {
  const distanceLimit = threshold ?? DEFAULT_THRESHOLD
  const exclude = excludeIds?.length
    ? new Set(excludeIds)
    : undefined
  let winner: {
    edgeId: EdgeId
    distance: number
    order: number
  } | undefined

  input.spatial.candidates(
    toRect(point, distanceLimit),
    {
      kinds: ['edge']
    }
  ).records.forEach((record) => {
    if (record.item.kind !== 'edge' || exclude?.has(record.item.id)) {
      return
    }

    const edge = input.graph().edges.get(record.item.id)
    if (!edge?.route.svgPath) {
      return
    }

    const distance = edgeApi.hit.distanceToPath({
      path: {
        points: [...edge.route.points],
        segments: [...edge.route.segments]
      },
      point
    })
    if (!Number.isFinite(distance) || distance > distanceLimit) {
      return
    }

    if (!winner) {
      winner = {
        edgeId: record.item.id,
        distance,
        order: record.order
      }
      return
    }

    if (
      distance < winner.distance
      || (
        distance === winner.distance
        && record.order > winner.order
      )
    ) {
      winner = {
        edgeId: record.item.id,
        distance,
        order: record.order
      }
    }
  })

  return winner?.edgeId
}
