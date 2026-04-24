import type { ShapeKind } from '@whiteboard/core/node/shape'
import { document as documentApi } from '@whiteboard/core/document'
import type {
  Document,
  Edge,
  EdgeStyle,
  EdgeType,
  Node,
  NodeData,
  NodeOwner,
  NodeStyle,
  Point,
  Size
} from '@whiteboard/core/types'

type BaseNodeInput = {
  id?: string
  position: Point
  size?: Size
  rotation?: number
  locked?: boolean
  owner?: NodeOwner
  groupId?: string
  data?: NodeData
  style?: NodeStyle
}

export type FrameInput = BaseNodeInput & {
  title: string
}

export type ShapeInput = BaseNodeInput & {
  kind: ShapeKind
  text: string
}

export type StickyInput = BaseNodeInput & {
  text: string
}

export type TextInput = BaseNodeInput & {
  text: string
}

export type EdgeInput = {
  id?: string
  type?: EdgeType
  sourceNodeId: string
  targetNodeId: string
  locked?: boolean
  groupId?: string
  data?: Record<string, unknown>
  style?: EdgeStyle
}

type MaterializedFrameInput = FrameInput & { id: string }
type MaterializedShapeInput = ShapeInput & { id: string }
type MaterializedStickyInput = StickyInput & { id: string }
type MaterializedTextInput = TextInput & { id: string }
type MaterializedEdgeInput = EdgeInput & { id: string }

const toRecord = <TItem extends { id: string }>(
  items: TItem[]
): Record<string, TItem> => Object.fromEntries(
  items.map((item) => [item.id, item])
)

export const toNodeEnd = (
  nodeId: string
) => ({
  kind: 'node' as const,
  nodeId
})

export const createFrameNode = (
  input: MaterializedFrameInput
): Node => {
  const {
    title,
    data,
    ...node
  } = input

  return {
    ...node,
    type: 'frame',
    data: {
      ...(data ?? {}),
      title
    }
  }
}

export const createShapeNode = (
  input: MaterializedShapeInput
): Node => {
  const {
    kind,
    text,
    data,
    ...node
  } = input

  return {
    ...node,
    type: 'shape',
    data: {
      ...(data ?? {}),
      kind,
      text
    }
  }
}

export const createStickyNode = (
  input: MaterializedStickyInput
): Node => {
  const {
    text,
    data,
    ...node
  } = input

  return {
    ...node,
    type: 'sticky',
    data: {
      ...(data ?? {}),
      text
    }
  }
}

export const createTextNode = (
  input: MaterializedTextInput
): Node => {
  const {
    text,
    data,
    ...node
  } = input

  return {
    ...node,
    type: 'text',
    data: {
      ...(data ?? {}),
      text
    }
  }
}

export const createEdge = (
  input: MaterializedEdgeInput
): Edge => ({
  id: input.id,
  type: input.type ?? 'linear',
  source: toNodeEnd(input.sourceNodeId),
  target: toNodeEnd(input.targetNodeId),
  locked: input.locked,
  groupId: input.groupId,
  data: input.data,
  style: input.style
})

export const createDocumentFromParts = (
  id: string,
  nodes: Node[],
  edges: Edge[]
): Document => ({
  ...documentApi.create(id),
  nodes: toRecord(nodes),
  edges: toRecord(edges),
  canvas: {
    order: [
      ...nodes.map((node) => ({ kind: 'node' as const, id: node.id })),
      ...edges.map((edge) => ({ kind: 'edge' as const, id: edge.id }))
    ]
  }
})

export type ScenarioDocumentBuilder = ReturnType<typeof createScenarioDocumentBuilder>

export const createScenarioDocumentBuilder = () => {
  const counters = new Map<string, number>()
  const frames: Node[] = []
  const contents: Node[] = []
  const edges: Edge[] = []

  const nextId = (prefix: string) => {
    const current = (counters.get(prefix) ?? 0) + 1
    counters.set(prefix, current)
    return `${prefix}-${String(current).padStart(4, '0')}`
  }

  return {
    addFrame: (input: FrameInput) => {
      const node = createFrameNode({
        ...input,
        id: input.id ?? nextId('frame')
      })
      frames.push(node)
      return node
    },
    addShape: (input: ShapeInput) => {
      const node = createShapeNode({
        ...input,
        id: input.id ?? nextId('shape')
      })
      contents.push(node)
      return node
    },
    addSticky: (input: StickyInput) => {
      const node = createStickyNode({
        ...input,
        id: input.id ?? nextId('sticky')
      })
      contents.push(node)
      return node
    },
    addText: (input: TextInput) => {
      const node = createTextNode({
        ...input,
        id: input.id ?? nextId('text')
      })
      contents.push(node)
      return node
    },
    addEdge: (input: EdgeInput) => {
      const edge = createEdge({
        ...input,
        id: input.id ?? nextId('edge')
      })
      edges.push(edge)
      return edge
    },
    build: (documentId: string) => createDocumentFromParts(
      documentId,
      [...frames, ...contents],
      edges
    )
  }
}
