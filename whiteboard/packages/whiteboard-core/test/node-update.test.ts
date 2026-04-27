import assert from 'node:assert/strict'
import { test } from 'vitest'
import { path as mutationPath } from '@shared/mutation'
import { node as nodeApi } from '@whiteboard/core/node'
import { document as documentApi } from '@whiteboard/core/document'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import { apply } from '@whiteboard/core/operations'

const FIXED_TIMESTAMP = Date.parse('2024-01-01T00:00:00.000Z')
const FIXED_ISO = new Date(FIXED_TIMESTAMP).toISOString()

const createDocWithNode = (node) => {
  const doc = documentApi.create('doc_1')
  doc.background = undefined
  doc.meta = {
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO
  }
  doc.nodes[node.id] = node
  doc.canvas.order = [{
    kind: 'node',
    id: node.id
  }]
  return doc
}

const createTextNode = (overrides = {}) => ({
  id: 'node_1',
  type: 'text',
  position: { x: 0, y: 0 },
  size: { width: 120, height: 40 },
  rotation: 0,
  data: {
    text: 'hello',
    items: ['a', 'b', 'c']
  },
  style: {
    color: '#111111',
    fontSize: 12
  },
  ...overrides
})

const replayInverse = (doc, operations) =>
  apply({
    doc,
    ops: operations,
    origin: 'user'
  })

test('node.update reducer 为 set(path) 生成精确 inverse 并可回放', () => {
  const doc = createDocWithNode(createTextNode())
  const result = apply({
    doc,
    ops: nodeApi.update.createOperation('node_1', {
      records: [{
        scope: 'data',
        op: 'set',
        path: mutationPath.of('text'),
        value: 'world'
      }]
    }),
    origin: 'user'
  })

  assert.ok(result.ok)
  assert.deepEqual(result.inverse, [{
    type: 'node.record.set',
    id: 'node_1',
    scope: 'data',
    path: mutationPath.of('text'),
    value: 'hello'
  }])

  const reverted = replayInverse(result.doc, result.inverse)
  assert.ok(reverted.ok)
  assert.deepEqual(reverted.doc.nodes.node_1, doc.nodes.node_1)
})

test('node.update inverse 在 set(path) 创建缺失祖先时退化为 scope 根级 set', () => {
  const node = createTextNode({
    data: {
      text: 'hello'
    }
  })
  const update = {
    records: [{
      scope: 'data',
      op: 'set',
      path: mutationPath.of('prefs', 'title'),
      value: 'Board'
    }]
  }

  const inverse = nodeApi.update.inverse(node, update)
  assert.ok(inverse.ok)
  assert.deepEqual(inverse.update, {
    records: [{
      scope: 'data',
      op: 'set',
      value: {
        text: 'hello'
      }
    }]
  })

  const forward = nodeApi.update.apply(node, update)
  assert.ok(forward.ok)
  const reverted = nodeApi.update.apply(forward.next, inverse.update)
  assert.ok(reverted.ok)
  assert.deepEqual(reverted.next, node)
})

test('node.update inverse 为 unset(path) 生成 path set 回滚', () => {
  const node = createTextNode()
  const update = {
    records: [{
      scope: 'style',
      op: 'unset',
      path: mutationPath.of('fontSize')
    }]
  }

  const inverse = nodeApi.update.inverse(node, update)
  assert.ok(inverse.ok)
  assert.deepEqual(inverse.update, {
    records: [{
      scope: 'style',
      op: 'set',
      path: mutationPath.of('fontSize'),
      value: 12
    }]
  })

  const forward = nodeApi.update.apply(node, update)
  assert.ok(forward.ok)
  const reverted = nodeApi.update.apply(forward.next, inverse.update)
  assert.ok(reverted.ok)
  assert.deepEqual(reverted.next, node)
})

test('node.update inverse 为数组 field set 生成精确 path set 回滚', () => {
  const node = createTextNode()
  const update = {
    records: [{
      scope: 'data',
      op: 'set',
      path: mutationPath.of('items'),
      value: ['a', 'x', 'y', 'c']
    }]
  }

  const inverse = nodeApi.update.inverse(node, update)
  assert.ok(inverse.ok)
  assert.deepEqual(inverse.update, {
    records: [{
      scope: 'data',
      op: 'set',
      path: mutationPath.of('items'),
      value: ['a', 'b', 'c']
    }]
  })

  const forward = nodeApi.update.apply(node, update)
  assert.ok(forward.ok)
  const reverted = nodeApi.update.apply(forward.next, inverse.update)
  assert.ok(reverted.ok)
  assert.deepEqual(reverted.next, node)
})

test('node.update 会为 direct mindmap data mutation 标记 node.value', () => {
  const tree = mindmapApi.tree.create({}, {
    idGenerator: {
      nodeId: () => 'mind_1'
    }
  })
  const doc = documentApi.create('doc_mindmap_1')
  doc.nodes.mind_1 = {
    id: 'mind_1',
    type: 'text',
    owner: {
      kind: 'mindmap',
      id: 'mind_1'
    },
    position: { x: 0, y: 0 },
    data: {
      text: 'root'
    }
  }
  doc.mindmaps.mind_1 = {
    id: 'mind_1',
    root: tree.rootNodeId,
    members: tree.nodes,
    children: tree.children,
    layout: tree.layout,
    meta: tree.meta
  }

  const result = apply({
    doc,
    ops: nodeApi.update.createOperation('mind_1', {
      records: [{
        scope: 'data',
        op: 'set',
        path: mutationPath.of('meta', 'title'),
        value: 'new'
      }]
    }),
    origin: 'user'
  })

  assert.ok(result.ok)
  assert.equal(result.extra.impact.node.value, true)
  assert.deepEqual(result.extra.impact.node.ids, ['mind_1'])
})

test('applyNodeUpdate 允许 frame 几何写入，并拒绝穿透 primitive 容器的 path set', () => {
  const frameResult = nodeApi.update.apply({
    id: 'frame_1',
    type: 'frame',
    position: { x: 0, y: 0 },
    size: { width: 240, height: 160 }
  }, {
    fields: {
      position: { x: 10, y: 20 }
    }
  })
  assert.equal(frameResult.ok, true)
  assert.deepEqual(frameResult.next.position, { x: 10, y: 20 })

  const primitivePathResult = nodeApi.update.apply(createTextNode(), {
    records: [{
      scope: 'data',
      op: 'set',
      path: mutationPath.of('text', 'value'),
      value: 'x'
    }]
  })
  assert.equal(primitivePathResult.ok, false)
  assert.match(primitivePathResult.message, /non-object container/)
})

test('node.update operation builder 会 compact update 载荷', () => {
  assert.deepEqual(
    nodeApi.update.createOperation('node_1', {
      fields: undefined,
      records: []
    }),
    []
  )

  assert.deepEqual(
    nodeApi.update.createFieldsOperation('node_1', {
      position: { x: 10, y: 20 }
    }),
    [{
      type: 'node.field.set',
      id: 'node_1',
      field: 'position',
      value: { x: 10, y: 20 }
    }]
  )
})
