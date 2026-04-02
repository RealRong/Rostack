import type { RoutingDragPayload } from '@engine-types/edge/routing'
import type { EngineContext } from '@engine-types/instance/engine'
import type { EdgeId, EdgeRouting, Operation, Point } from '@whiteboard/core/types'

type RoutingInstance = Pick<EngineContext, 'read'>

type RoutingOptions = {
  instance: RoutingInstance
}

export class Routing {
  private readonly instance: RoutingInstance

  constructor({ instance }: RoutingOptions) {
    this.instance = instance
  }

  private getEdge = (edgeId: EdgeId) =>
    this.instance.read.edge.get(edgeId)?.edge

  private moveRoutingPoint = (
    edgeId: EdgeId,
    routing: EdgeRouting | undefined,
    points: Point[],
    index: number,
    pointWorld: Point
  ): Operation | undefined => {
    if (index < 0 || index >= points.length) return undefined
    const current = points[index]
    if (current.x === pointWorld.x && current.y === pointWorld.y) return undefined
    const nextPoints = points.map((point, idx) =>
      idx === index ? pointWorld : point
    )
    return {
      type: 'edge.update',
      id: edgeId,
      patch: {
        routing: {
          ...(routing ?? {}),
          mode: routing?.mode ?? 'manual',
          points: nextPoints
        }
      }
    }
  }

  begin = (options: {
    edgeId: EdgeId
    index: number
    pointer: {
      pointerId: number
      world: Point
    }
  }): RoutingDragPayload | undefined => {
    const edge = this.getEdge(options.edgeId)
    if (!edge || edge.type === 'bezier' || edge.type === 'curve') return undefined

    const points = edge.routing?.points ?? []
    if (options.index < 0 || options.index >= points.length) return undefined

    const start = options.pointer.world
    const origin = points[options.index]
    if (!origin) return undefined

    return {
      edgeId: options.edgeId,
      index: options.index,
      pointerId: options.pointer.pointerId,
      start,
      origin,
      point: origin
    }
  }

  update = (
    draft: RoutingDragPayload,
    pointer: {
      world: Point
    }
  ): RoutingDragPayload | undefined => {
    const edge = this.getEdge(draft.edgeId)
    if (!edge || edge.type === 'bezier' || edge.type === 'curve') {
      return undefined
    }

    const points = edge.routing?.points ?? []
    if (draft.index < 0 || draft.index >= points.length) {
      return undefined
    }

    const current = pointer.world
    return {
      ...draft,
      point: {
        x: draft.origin.x + (current.x - draft.start.x),
        y: draft.origin.y + (current.y - draft.start.y)
      }
    }
  }

  commit = (draft: RoutingDragPayload): Operation[] => {
    const edge = this.getEdge(draft.edgeId)
    if (!edge || edge.type === 'bezier' || edge.type === 'curve') {
      return []
    }

    const operation = this.moveRoutingPoint(
      edge.id,
      edge.routing,
      edge.routing?.points ?? [],
      draft.index,
      draft.point
    )
    return operation ? [operation] : []
  }
}
