import type {
  ShapeKind
} from '@whiteboard/core/node'
import type {
  Document,
  Edge,
  Node,
  SpatialNode
} from '@whiteboard/core/types'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import {
  createDocumentFromParts,
  createShapeNode,
  toNodeEnd
} from '@whiteboard/demo/scenarios/builder'
import type { ScenarioPreset } from '@whiteboard/demo/scenarios/types'

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
      size: { width: 144, height: 20 },
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
    ...createDocumentFromParts('demo-basic', nodes, edges),
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

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if ((row + col) % 4 !== 0) {
        continue
      }

      const targetCol = col + 1
      if (targetCol >= cols) {
        continue
      }

      edges.push({
        id: `edge-${row}-${col}`,
        type: 'linear',
        source: toNodeEnd(`grid-${row}-${col}`),
        target: toNodeEnd(`grid-${row}-${targetCol}`)
      })
    }
  }

  return createDocumentFromParts('demo-dense', nodes, edges)
}

const createMindmapDocument = (): Document => {
  const mindmapId = 'mindmap-root'
  const rootId = 'mm-1'
  const createNodeId = (() => {
    const ids = ['mm-2', 'mm-3', 'mm-4', 'mm-5', 'mm-6', 'mm-7']
    let index = 0
    return () => ids[index++]!
  })()
  const instantiated = mindmapApi.template.instantiate({
    rootId,
    createNodeId,
    template: {
      layout: {
        side: 'both',
        mode: 'tidy',
        hGap: 28,
        vGap: 18
      },
      root: {
        node: {
          type: 'text',
          data: { text: '核心议题' }
        },
        children: [
          {
            side: 'left',
            node: {
              type: 'text',
              data: { text: '左分支' }
            },
            children: [
              {
                node: {
                  type: 'text',
                  data: { text: '子节点 A' }
                }
              },
              {
                node: {
                  type: 'text',
                  data: { text: '子节点 B' }
                }
              }
            ]
          },
          {
            side: 'right',
            node: {
              type: 'text',
              data: { text: '右分支' }
            },
            children: [
              {
                node: {
                  type: 'text',
                  data: { text: '子节点 C' }
                }
              },
              {
                node: {
                  type: 'text',
                  data: { text: '子节点 D' }
                }
              }
            ]
          }
        ]
      }
    }
  })

  const nodes: Node[] = [
    ...Object.entries(instantiated.nodes).map(([nodeId, templateNode]) => ({
      id: nodeId,
      type: templateNode.type ?? 'text',
      owner: {
        kind: 'mindmap' as const,
        id: mindmapId
      },
      position: nodeId === rootId
        ? { x: -80, y: -60 }
        : { x: 0, y: 0 },
      size: templateNode.size ?? { width: 144, height: 20 },
      rotation: templateNode.rotation,
      locked: templateNode.locked,
      data: templateNode.data,
      style: templateNode.style
    })),
    {
      id: 'note-1',
      type: 'sticky',
      position: { x: 420, y: -120 },
      size: { width: 180, height: 120 },
      data: { text: '拖拽思维导图节点' }
    }
  ]

  return {
    ...createDocumentFromParts('demo-mindmap', nodes, []),
    mindmaps: {
      [mindmapId]: {
        id: mindmapId,
        tree: {
          rootId,
          nodes: Object.fromEntries(
            Object.entries(instantiated.tree.nodes).map(([nodeId, member]) => [
              nodeId,
              {
                parentId: member.parentId,
                children: [...(instantiated.tree.children[nodeId] ?? [])],
                value: {
                  ...(member.side === undefined ? {} : { side: member.side }),
                  ...(member.collapsed === undefined ? {} : { collapsed: member.collapsed }),
                  branchStyle: member.branch
                }
              }
            ])
          )
        },
        layout: instantiated.tree.layout
      }
    }
  }
}

const createShapesDocument = (): Document => {
  const create = (
    input: Omit<SpatialNode, 'type'> & {
      kind: ShapeKind
      text: string
    }
  ) => createShapeNode(input)

  const nodes: Node[] = [
    create({
      id: 'shape-start',
      kind: 'pill',
      text: 'Start',
      position: { x: -520, y: -160 },
      size: { width: 200, height: 100 }
    }),
    create({
      id: 'shape-process',
      kind: 'rect',
      text: 'Process',
      position: { x: -240, y: -160 },
      size: { width: 180, height: 110 }
    }),
    create({
      id: 'shape-data',
      kind: 'parallelogram',
      text: 'Input / Output',
      position: { x: 20, y: -160 },
      size: { width: 210, height: 110 }
    }),
    create({
      id: 'shape-diamond',
      kind: 'diamond',
      text: 'Decision',
      position: { x: 320, y: -180 },
      size: { width: 180, height: 180 }
    }),
    create({
      id: 'shape-database',
      kind: 'cylinder',
      text: 'Database',
      position: { x: -460, y: 120 },
      size: { width: 180, height: 130 }
    }),
    create({
      id: 'shape-document',
      kind: 'document',
      text: 'Document',
      position: { x: -180, y: 120 },
      size: { width: 190, height: 130 }
    }),
    create({
      id: 'shape-subprocess',
      kind: 'predefined-process',
      text: 'Subprocess',
      position: { x: 120, y: 130 },
      size: { width: 210, height: 110 }
    }),
    create({
      id: 'shape-callout',
      kind: 'callout',
      text: '统一 shape 节点后，文本编辑、切换样式、catalog 都走一条链路。',
      position: { x: 410, y: 100 },
      size: { width: 280, height: 170 }
    }),
    create({
      id: 'shape-cloud',
      kind: 'cloud',
      text: 'Cloud',
      position: { x: 380, y: -10 },
      size: { width: 220, height: 140 }
    }),
    create({
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

  return createDocumentFromParts('demo-shapes', nodes, edges)
}

export const showcaseScenarios: ScenarioPreset[] = [
  {
    id: 'basic',
    kind: 'showcase',
    documentId: 'demo-basic',
    label: '基础流程',
    description: '常规节点、连线与基础编辑行为。',
    create: createBasicDocument
  },
  {
    id: 'mindmap',
    kind: 'showcase',
    documentId: 'demo-mindmap',
    label: '思维导图',
    description: '内置 mindmap 树、布局与拖拽交互。',
    create: createMindmapDocument
  },
  {
    id: 'shapes',
    kind: 'showcase',
    documentId: 'demo-shapes',
    label: '图形节点',
    description: '第一批 shape、sticky 与注释节点。',
    create: createShapesDocument
  },
  {
    id: 'dense',
    kind: 'showcase',
    documentId: 'demo-dense',
    label: 'Synthetic Dense',
    description: '保留的纯渲染密集样例，不作为有语义数据主入口。',
    create: createDenseDocument
  }
]
