import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createMutationProgramWriter } from '@shared/mutation'
import { createWhiteboardProgramWriter } from '@whiteboard/core/operations'

test('WhiteboardProgramWriter lowers domain writes to shared program steps', () => {
  const base = createMutationProgramWriter<string>()
  const writer = createWhiteboardProgramWriter(base)

  writer.document.create({
    id: 'doc_1',
    nodes: {},
    edges: {},
    groups: {},
    mindmaps: {},
    canvas: {
      order: []
    }
  })
  writer.edge.label.insert('edge_1', {
    id: 'label_1',
    text: 'Label',
    t: 0.5,
    offset: 12
  }, {
    kind: 'before',
    labelId: 'label_2'
  })
  writer.edge.route.move('edge_1', 'point_1', {
    kind: 'after',
    pointId: 'point_2'
  })
  writer.mindmap.tree.patch('mindmap_1', 'node_1', {
    collapsed: true
  })
  writer.semantic.mindmap.layout('mindmap_1')

  assert.deepEqual(base.build(), {
    steps: [
      {
        type: 'entity.create',
        entity: {
          table: 'document',
          id: 'document'
        },
        value: {
          id: 'doc_1',
          nodes: {},
          edges: {},
          groups: {},
          mindmaps: {},
          canvas: {
            order: []
          }
        }
      },
      {
        type: 'ordered.insert',
        structure: 'edge.labels:edge_1',
        itemId: 'label_1',
        value: {
          id: 'label_1',
          text: 'Label',
          t: 0.5,
          offset: 12
        },
        to: {
          kind: 'before',
          itemId: 'label_2'
        }
      },
      {
        type: 'ordered.move',
        structure: 'edge.route:edge_1',
        itemId: 'point_1',
        to: {
          kind: 'after',
          itemId: 'point_2'
        }
      },
      {
        type: 'tree.node.patch',
        structure: 'mindmap.tree:mindmap_1',
        nodeId: 'node_1',
        patch: {
          collapsed: true
        }
      },
      {
        type: 'semantic.change',
        key: 'mindmap.layout',
        change: ['mindmap_1']
      }
    ]
  })
})
