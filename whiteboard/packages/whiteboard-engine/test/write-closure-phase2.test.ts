import assert from 'node:assert/strict'
import { test } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import { product } from '@whiteboard/product'

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
    document
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

  assert.equal(result.write.doc.nodes.text_1, undefined)
  assert.deepEqual(
    result.write.forward.map((op) => op.type),
    [
      'node.delete'
    ]
  )
})

test('node.text.commit merges text, size, fontSize, and wrapWidth for generic text nodes', () => {
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
    document
  })

  const result = engine.execute({
    type: 'node.text.commit',
    nodeId: 'text_1',
    field: 'text',
    value: 'updated',
    size: {
      width: 180,
      height: 48
    },
    fontSize: 20,
    wrapWidth: 180
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.deepEqual(result.write.doc.nodes.text_1?.data, {
    text: 'updated',
    wrapWidth: 180
  })
  assert.deepEqual(result.write.doc.nodes.text_1?.size, {
    width: 180,
    height: 48
  })
  assert.deepEqual(result.write.doc.nodes.text_1?.style, {
    fontSize: 20
  })
})

test('node.text.commit routes mindmap topic text and size through mindmap operations', () => {
  const engine = createEngine({
    document: documentApi.create('doc_write_closure_mindmap_text_commit')
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

  const result = engine.execute({
    type: 'node.text.commit',
    nodeId: createResult.data.rootId,
    field: 'text',
    value: 'Updated topic',
    size: {
      width: 220,
      height: 64
    },
    fontSize: 22
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.equal(
    result.write.doc.nodes[createResult.data.rootId]?.data?.text,
    'Updated topic'
  )
  assert.deepEqual(
    result.write.doc.nodes[createResult.data.rootId]?.size,
    {
      width: 220,
      height: 64
    }
  )
  assert.equal(
    result.write.doc.nodes[createResult.data.rootId]?.style?.fontSize,
    22
  )
  assert.deepEqual(
    result.write.forward.map((op) => op.type),
    [
      'mindmap.topic.field.set',
      'mindmap.topic.record.set',
      'mindmap.topic.record.set'
    ]
  )
})
