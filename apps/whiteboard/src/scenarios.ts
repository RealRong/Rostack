import type {
  Document,
  Edge,
  MindmapTree,
  Node,
  SpatialNode
} from '@whiteboard/core/types'
import { createDocument } from '@whiteboard/core/document'
import { TEXT_START_SIZE } from '@whiteboard/core/node'

type Scenario = {
  id: string
  documentId: string
  label: string
  description: string
  create: () => Document
}

const toRecord = <T extends { id: string }>(items: T[]) =>
  Object.fromEntries(items.map((item) => [item.id, item]))

const toNodeEnd = (nodeId: string) => ({
  kind: 'node' as const,
  nodeId
})

const createShapeNode = (
  input: Omit<SpatialNode, 'type'> & {
    kind: string
    text: string
  }
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

const createBaseDocument = (id: string, nodes: Node[], edges: Edge[]): Document => ({
  ...createDocument(id),
  nodes: toRecord(nodes),
  edges: toRecord(edges),
  order: [
    ...nodes.map((node) => ({ kind: 'node' as const, id: node.id })),
    ...edges.map((edge) => ({ kind: 'edge' as const, id: edge.id }))
  ]
})

const createBasicDocument = (): Document => {
  const groupId = 'group-1'
  const nodes: Node[] = [
    {
      id: 'node-1',
      type: 'shape',
      position: { x: -200, y: -80 },
      size: { width: 160, height: 100 },
      groupId,
      data: { kind: 'rect', text: 'Start' }
    },
    {
      id: 'node-2',
      type: 'shape',
      position: { x: 140, y: -40 },
      size: { width: 180, height: 120 },
      groupId,
      data: { kind: 'rect', text: 'Process' }
    },
    {
      id: 'node-3',
      type: 'text',
      position: { x: -120, y: 140 },
      size: { ...TEXT_START_SIZE },
      groupId,
      data: { text: '双击编辑文本' }
    },
    {
      id: 'node-4',
      type: 'sticky',
      position: { x: 200, y: 160 },
      size: { width: 160, height: 120 },
      data: { text: 'Sticky 便签' }
    }
  ]

  const edges: Edge[] = [
    {
      id: 'edge-1',
      type: 'linear',
      source: toNodeEnd('node-1'),
      target: toNodeEnd('node-2')
    },
    {
      id: 'edge-2',
      type: 'linear',
      source: toNodeEnd('node-2'),
      target: toNodeEnd('node-3')
    }
  ]

  return {
    ...createBaseDocument('demo-basic', nodes, edges),
    groups: {
      [groupId]: {
        id: groupId,
        name: '基础分组'
      }
    }
  }
}

const createDenseDocument = (): Document => {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const rows = 18
  const cols = 22
  const size = { width: 120, height: 70 }
  const gapX = 150
  const gapY = 110

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const id = `grid-${row}-${col}`
      nodes.push({
        id,
        type: 'shape',
        position: {
          x: col * gapX - (cols * gapX) / 2,
          y: row * gapY - (rows * gapY) / 2
        },
        size,
        data: {
          kind: 'rect',
          text: `${row + 1}-${col + 1}`
        }
      })
    }
  }

  const linkEvery = 4
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if ((row + col) % linkEvery !== 0) continue
      const sourceId = `grid-${row}-${col}`
      const targetCol = col + 1
      if (targetCol >= cols) continue
      edges.push({
        id: `edge-${row}-${col}`,
        type: 'linear',
        source: toNodeEnd(sourceId),
        target: toNodeEnd(`grid-${row}-${targetCol}`)
      })
    }
  }

  return createBaseDocument('demo-dense', nodes, edges)
}

const createMindmapDocument = (): Document => {
  const tree: MindmapTree = {
    id: 'mindmap-root',
    rootId: 'mm-1',
    nodes: {
      'mm-1': { id: 'mm-1', data: { kind: 'text', text: '核心议题' } },
      'mm-2': { id: 'mm-2', parentId: 'mm-1', side: 'left', data: { kind: 'text', text: '左分支' } },
      'mm-3': { id: 'mm-3', parentId: 'mm-1', side: 'right', data: { kind: 'text', text: '右分支' } },
      'mm-4': { id: 'mm-4', parentId: 'mm-2', data: { kind: 'text', text: '子节点 A' } },
      'mm-5': { id: 'mm-5', parentId: 'mm-2', data: { kind: 'text', text: '子节点 B' } },
      'mm-6': { id: 'mm-6', parentId: 'mm-3', data: { kind: 'text', text: '子节点 C' } },
      'mm-7': { id: 'mm-7', parentId: 'mm-3', data: { kind: 'text', text: '子节点 D' } }
    },
    children: {
      'mm-1': ['mm-2', 'mm-3'],
      'mm-2': ['mm-4', 'mm-5'],
      'mm-3': ['mm-6', 'mm-7'],
      'mm-4': [],
      'mm-5': [],
      'mm-6': [],
      'mm-7': []
    },
    meta: {
      position: { x: 0, y: 0 }
    }
  }

  const nodes: Node[] = [
    {
      id: 'mindmap-root',
      type: 'mindmap',
      position: { x: -80, y: -60 },
      size: { width: 200, height: 140 },
      data: { mindmap: tree }
    },
    {
      id: 'note-1',
      type: 'sticky',
      position: { x: 420, y: -120 },
      size: { width: 180, height: 120 },
      data: { text: '拖拽思维导图节点' }
    }
  ]

  return createBaseDocument('demo-mindmap', nodes, [])
}

const createShapesDocument = (): Document => {
  const nodes: Node[] = [
    createShapeNode({
      id: 'shape-start',
      kind: 'pill',
      text: 'Start',
      position: { x: -520, y: -160 },
      size: { width: 200, height: 100 }
    }),
    createShapeNode({
      id: 'shape-process',
      kind: 'rect',
      text: 'Process',
      position: { x: -240, y: -160 },
      size: { width: 180, height: 110 }
    }),
    createShapeNode({
      id: 'shape-data',
      kind: 'parallelogram',
      text: 'Input / Output',
      position: { x: 20, y: -160 },
      size: { width: 210, height: 110 }
    }),
    createShapeNode({
      id: 'shape-diamond',
      kind: 'diamond',
      text: 'Decision',
      position: { x: 320, y: -180 },
      size: { width: 180, height: 180 }
    }),
    createShapeNode({
      id: 'shape-database',
      kind: 'cylinder',
      text: 'Database',
      position: { x: -460, y: 120 },
      size: { width: 180, height: 130 }
    }),
    createShapeNode({
      id: 'shape-document',
      kind: 'document',
      text: 'Document',
      position: { x: -180, y: 120 },
      size: { width: 190, height: 130 }
    }),
    createShapeNode({
      id: 'shape-subprocess',
      kind: 'predefined-process',
      text: 'Subprocess',
      position: { x: 120, y: 130 },
      size: { width: 210, height: 110 }
    }),
    createShapeNode({
      id: 'shape-callout',
      kind: 'callout',
      text: '统一 shape 节点后，文本编辑、切换样式、catalog 都走一条链路。',
      position: { x: 410, y: 100 },
      size: { width: 280, height: 170 }
    }),
    createShapeNode({
      id: 'shape-cloud',
      kind: 'cloud',
      text: 'Cloud',
      position: { x: 380, y: -10 },
      size: { width: 220, height: 140 }
    }),
    createShapeNode({
      id: 'shape-highlight',
      kind: 'highlight',
      text: 'Annotation',
      position: { x: 430, y: 310 },
      size: { width: 240, height: 110 }
    })
  ]

  const edges: Edge[] = [
    {
      id: 'shape-edge-1',
      type: 'linear',
      source: toNodeEnd('shape-start'),
      target: toNodeEnd('shape-process')
    },
    {
      id: 'shape-edge-2',
      type: 'linear',
      source: toNodeEnd('shape-process'),
      target: toNodeEnd('shape-data')
    },
    {
      id: 'shape-edge-3',
      type: 'linear',
      source: toNodeEnd('shape-data'),
      target: toNodeEnd('shape-diamond')
    },
    {
      id: 'shape-edge-4',
      type: 'linear',
      source: toNodeEnd('shape-database'),
      target: toNodeEnd('shape-document')
    },
    {
      id: 'shape-edge-5',
      type: 'linear',
      source: toNodeEnd('shape-document'),
      target: toNodeEnd('shape-subprocess')
    },
    {
      id: 'shape-edge-6',
      type: 'linear',
      source: toNodeEnd('shape-subprocess'),
      target: toNodeEnd('shape-diamond')
    },
    {
      id: 'shape-edge-7',
      type: 'linear',
      source: toNodeEnd('shape-cloud'),
      target: toNodeEnd('shape-callout')
    }
  ]

  return createBaseDocument('demo-shapes', nodes, edges)
}

export const scenarios: Scenario[] = [
  {
    id: 'basic',
    documentId: 'demo-basic',
    label: '基础流程',
    description: '常规节点 + 连线 + 分组',
    create: createBasicDocument
  },
  {
    id: 'dense',
    documentId: 'demo-dense',
    label: '超多节点',
    description: '大规模节点渲染压力测试',
    create: createDenseDocument
  },
  {
    id: 'mindmap',
    documentId: 'demo-mindmap',
    label: '思维导图',
    description: '内置 Mindmap 树与交互',
    create: createMindmapDocument
  },
  {
    id: 'shapes',
    documentId: 'demo-shapes',
    label: '图形节点',
    description: '第一批 shape / sticker 节点',
    create: createShapesDocument
  }
]

export type { Scenario }
