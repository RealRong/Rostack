import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type {
  NodeId,
  Point,
  Rect
} from '@whiteboard/core/types'
import { store } from '@shared/core'
import type {
  Read as EditorGraphQuery
} from '@whiteboard/editor-graph'
import type { GraphNodeRead } from './node'

export type FrameRead = {
  at: (point: Point) => NodeId | undefined
  parent: (nodeId: NodeId) => NodeId | undefined
  children: (frameId: NodeId) => readonly NodeId[]
  descendants: (frameId: NodeId) => readonly NodeId[]
}

type Candidate = {
  id: NodeId
  order: number
  area: number
}

const readArea = (rect: Rect) => rect.width * rect.height

const pick = (
  current: Candidate | undefined,
  next: Candidate
) => {
  if (!current) {
    return next
  }
  if (next.area < current.area) {
    return next
  }
  if (next.area > current.area) {
    return current
  }

  return next.order > current.order
    ? next
    : current
}

const contains = (
  outer: Rect,
  inner: Rect
) => geometryApi.rect.contains(outer, inner)

const scanFrames = (
  records: ReturnType<EditorGraphQuery['spatial']['rect']>,
  readFrameRect: (nodeId: NodeId) => Rect | undefined
) => records.flatMap((record) => {
  if (record.item.kind !== 'node') {
    return []
  }

  const rect = readFrameRect(record.item.id)
  return rect
    ? [{
        id: record.item.id,
        rect,
        order: record.order
      }]
    : []
})

export const createFrameRead = ({
  spatial,
  node
}: {
  spatial: EditorGraphQuery['spatial']
  node: Pick<GraphNodeRead, 'graph'>
}): FrameRead => {
  const readFrameRect = (
    nodeId: NodeId
  ) => {
    const view = store.read(node.graph, nodeId)
    if (!view || view.base.node.type !== 'frame') {
      return undefined
    }

    return view.geometry.rect
  }
  const readNodeRect = (
    nodeId: NodeId
  ) => store.read(node.graph, nodeId)?.geometry.rect

  const parent: FrameRead['parent'] = (nodeId) => {
    const rect = readNodeRect(nodeId)
    if (!rect) {
      return undefined
    }

    let best: Candidate | undefined
    const frames = scanFrames(
      spatial.rect(rect, {
        kinds: ['node']
      }),
      readFrameRect
    )

    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index]!
      if (frame.id === nodeId || !contains(frame.rect, rect)) {
        continue
      }

      best = pick(best, {
        id: frame.id,
        order: frame.order,
        area: readArea(frame.rect)
      })
    }

    return best?.id
  }

  const at: FrameRead['at'] = (point) => {
    let best: Candidate | undefined
    const frames = scanFrames(
      spatial.point(point, {
        kinds: ['node']
      }),
      readFrameRect
    )

    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index]!
      if (!geometryApi.rect.containsPoint(point, frame.rect)) {
        continue
      }

      best = pick(best, {
        id: frame.id,
        order: frame.order,
        area: readArea(frame.rect)
      })
    }

    return best?.id
  }

  const children: FrameRead['children'] = (frameId) => {
    const frameRect = readFrameRect(frameId)
    if (!frameRect) {
      return []
    }

    const result: NodeId[] = []
    const candidates = spatial.rect(frameRect, {
      kinds: ['node']
    })

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]
      if (!candidate || candidate.item.kind !== 'node' || candidate.item.id === frameId) {
        continue
      }

      const rect = readNodeRect(candidate.item.id)
      if (!rect || !contains(frameRect, rect) || parent(candidate.item.id) !== frameId) {
        continue
      }

      result.push(candidate.item.id)
    }

    return result
  }

  const descendants: FrameRead['descendants'] = (frameId) => {
    const result: NodeId[] = []
    const visited = new Set<NodeId>()
    const stack = [...children(frameId)].reverse()

    while (stack.length > 0) {
      const currentId = stack.pop()
      if (!currentId || visited.has(currentId)) {
        continue
      }

      visited.add(currentId)
      result.push(currentId)

      const directChildren = children(currentId)
      for (let index = directChildren.length - 1; index >= 0; index -= 1) {
        stack.push(directChildren[index]!)
      }
    }

    return result
  }

  return {
    at,
    parent,
    children,
    descendants
  }
}
