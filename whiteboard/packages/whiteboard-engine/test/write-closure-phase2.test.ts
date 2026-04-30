import assert from 'node:assert/strict'
import { test } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import type { LayoutBackend } from '@whiteboard/core/layout'
import { createEngine } from '@whiteboard/engine'
import { product } from '@whiteboard/product'
import { createTestLayout } from './support'

const createTextNode = ({
  id,
  x,
  y,
  text
}: {
  id: string
  x: number
  y: number
  text: string
}) => ({
  id,
  type: 'text' as const,
  position: {
    x,
    y
  },
  size: {
    width: 120,
    height: 40
  },
  data: {
    text
  }
})

const createSizedTextLayout = (
  sizes: Readonly<Record<string, { width: number; height: number }>>
) => createTestLayout({
  measure: (request) => {
    if (request.kind !== 'size' || request.source?.kind !== 'node') {
      return undefined
    }

    const size = sizes[request.source.nodeId]
    return size
      ? {
          kind: 'size',
          size
        }
      : undefined
  }
} satisfies LayoutBackend)

test('node.text.commit deletes empty text nodes through engine semantics', () => {
  const document = documentApi.create('doc_write_closure_text_delete')
  document.nodes.text_1 = createTextNode({
    id: 'text_1',
    x: 0,
    y: 0,
    text: 'hello'
  })
  document.nodes.text_2 = createTextNode({
    id: 'text_2',
    x: 200,
    y: 0,
    text: 'world'
  })
  document.edges.edge_1 = {
    id: 'edge_1',
    type: 'straight',
    source: {
      kind: 'node',
      nodeId: 'text_1'
    },
    target: {
      kind: 'node',
      nodeId: 'text_2'
    },
    route: {
      kind: 'auto'
    }
  }
  document.canvas.order = [
    { kind: 'node', id: 'text_1' },
    { kind: 'node', id: 'text_2' },
    { kind: 'edge', id: 'edge_1' }
  ]

  const engine = createEngine({
    document,
    layout: createTestLayout()
  })

  const result = engine.execute({
    type: 'node.text.commit',
    nodeId: 'text_1',
    field: 'text',
    value: '   '
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.equal(result.commit.document.nodes.text_1, undefined)
  assert.deepEqual(
    result.commit.authored.map((op) => op.type),
    [
      'node.delete'
    ]
  )
})

test('node.text.commit merges text and measured size for generic text nodes', () => {
  const document = documentApi.create('doc_write_closure_text_merge')
  document.nodes.text_1 = {
    ...createTextNode({
      id: 'text_1',
      x: 0,
      y: 0,
      text: 'hello'
    }),
    data: {
      text: 'hello',
      wrapWidth: 120
    },
    style: {
      fontSize: 14
    }
  }
  document.canvas.order = [
    { kind: 'node', id: 'text_1' }
  ]

  const engine = createEngine({
    document,
    layout: createSizedTextLayout({
      text_1: {
        width: 180,
        height: 48
      }
    })
  })

  const result = engine.execute({
    type: 'node.text.commit',
    nodeId: 'text_1',
    field: 'text',
    value: 'updated'
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.deepEqual(result.commit.document.nodes.text_1?.data, {
    text: 'updated',
    wrapWidth: 120
  })
  assert.deepEqual(result.commit.document.nodes.text_1?.size, {
    width: 180,
    height: 48
  })
  assert.deepEqual(result.commit.document.nodes.text_1?.style, {
    fontSize: 14
  })
})

test('node.text.commit routes mindmap topic text and size through mindmap operations', () => {
  const engine = createEngine({
    document: documentApi.create('doc_write_closure_mindmap_text_commit'),
    layout: createTestLayout()
  })

  const createResult = engine.execute({
    type: 'mindmap.create',
    input: {
      template: product.mindmap.template.build({
        preset: 'mindmap.capsule-outline'
      })
    }
  })

  assert.equal(createResult.ok, true)
  if (!createResult.ok) {
    return
  }

  const rootId = createResult.data.rootId
  const layout = createSizedTextLayout({
    [rootId]: {
      width: 220,
      height: 64
    }
  })
  const engineWithLayout = createEngine({
    document: engine.doc(),
    layout
  })

  const result = engineWithLayout.execute({
    type: 'node.text.commit',
    nodeId: rootId,
    field: 'text',
    value: 'Updated topic'
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.equal(
    result.commit.document.nodes[rootId]?.data?.text,
    'Updated topic'
  )
  assert.deepEqual(
    result.commit.document.nodes[rootId]?.size,
    {
      width: 220,
      height: 64
    }
  )
  assert.deepEqual(
    result.commit.authored.map((op) => op.type),
    [
      'mindmap.topic.patch',
      'mindmap.topic.patch'
    ]
  )
})
