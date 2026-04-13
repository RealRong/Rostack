import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addChild,
  createMindmap,
  createMindmapUpdateOps,
  insertNode,
  layoutMindmap,
  layoutMindmapTidy,
  moveSubtree,
  removeSubtree,
  updateNode
} from '../dist/mindmap/index.js'

test('mindmap commands', () => {
  let nodeSeq = 1
  const idGenerator = {
    treeId: () => 'mindmap_1',
    nodeId: () => `node_${nodeSeq++}`
  }

  const tree = createMindmap({ idGenerator })
  assert.equal(tree.id, 'mindmap_1')
  assert.equal(tree.rootId, 'node_1')

  const addOne = addChild(tree, tree.rootId, { kind: 'text', text: 'child-1' }, { side: 'right', idGenerator })
  assert.ok(addOne.ok)
  const tree1 = addOne.data.tree
  const addTwo = addChild(tree1, tree1.rootId, { kind: 'text', text: 'child-2' }, { side: 'left', idGenerator })
  assert.ok(addTwo.ok)
  const tree2 = addTwo.data.tree

  const children = tree2.children[tree2.rootId]
  assert.equal(children.length, 2)

  const move = moveSubtree(tree2, {
    nodeId: children[1],
    parentId: children[0]
  })
  assert.ok(move.ok)
  const tree3 = move.data.tree
  assert.equal(tree3.nodes[children[1]].parentId, children[0])

  const removed = removeSubtree(tree3, {
    nodeId: children[0]
  })
  assert.ok(removed.ok)
  const tree4 = removed.data.tree
  assert.ok(tree4.nodes[children[0]] === undefined)
  assert.ok(tree4.rootId)
})

test('mindmap layout outputs coordinates', () => {
  let nodeSeq = 1
  const idGenerator = {
    treeId: () => 'mindmap_layout',
    nodeId: () => `node_${nodeSeq++}`
  }
  const tree = createMindmap({ idGenerator })
  const add = addChild(tree, tree.rootId, { kind: 'text', text: 'child' }, { side: 'right', idGenerator })
  assert.ok(add.ok)
  const tree1 = add.data.tree

  const getNodeSize = () => ({ width: 120, height: 30 })
  const layout = layoutMindmap(tree1, getNodeSize)
  const tidy = layoutMindmapTidy(tree1, getNodeSize)

  assert.ok(layout.node[tree1.rootId])
  assert.ok(tidy.node[tree1.rootId])
  assert.ok(layout.bbox.width >= 0 && layout.bbox.height >= 0)
  assert.ok(tidy.bbox.width >= 0 && tidy.bbox.height >= 0)
})

test('mindmap updateNode 支持 canonical data mutations 和字段更新', () => {
  let nodeSeq = 1
  const idGenerator = {
    treeId: () => 'mindmap_mutation',
    nodeId: () => `node_${nodeSeq++}`
  }

  const tree = createMindmap({
    idGenerator,
    rootData: {
      kind: 'custom',
      text: 'root',
      tags: ['a', 'b']
    }
  })

  const setResult = updateNode(tree, {
    nodeId: tree.rootId,
    update: {
      records: [{
        op: 'set',
        path: 'meta.title',
        value: 'Board'
      }]
    }
  })
  assert.ok(setResult.ok)
  assert.equal(setResult.data.tree.nodes[tree.rootId].data.meta.title, 'Board')

  const unsetResult = updateNode(setResult.data.tree, {
    nodeId: tree.rootId,
    update: {
      records: [{
        op: 'unset',
        path: 'meta.title'
      }]
    }
  })
  assert.ok(unsetResult.ok)
  assert.equal('title' in unsetResult.data.tree.nodes[tree.rootId].data.meta, false)

  const spliceResult = updateNode(unsetResult.data.tree, {
    nodeId: tree.rootId,
    update: {
      records: [{
        op: 'splice',
        path: 'tags',
        index: 1,
        deleteCount: 1,
        values: ['x', 'y']
      }]
    }
  })
  assert.ok(spliceResult.ok)
  assert.deepEqual(spliceResult.data.tree.nodes[tree.rootId].data.tags, ['a', 'x', 'y'])

  const collapseResult = updateNode(spliceResult.data.tree, {
    nodeId: tree.rootId,
    update: {
      collapsed: true
    }
  })
  assert.ok(collapseResult.ok)
  assert.equal(collapseResult.data.tree.nodes[tree.rootId].collapsed, true)
})

test('mindmap insertNode 会在目标节点上方插入新父节点', () => {
  let nodeSeq = 1
  const idGenerator = {
    treeId: () => 'mindmap_parent',
    nodeId: () => `node_${nodeSeq++}`
  }

  const tree = createMindmap({ idGenerator })
  const childResult = addChild(
    tree,
    tree.rootId,
    { kind: 'text', text: 'child' },
    { side: 'left', idGenerator }
  )
  assert.ok(childResult.ok)

  const wrapResult = insertNode(childResult.data.tree, {
    kind: 'parent',
    nodeId: childResult.data.nodeId,
    payload: { kind: 'text', text: 'parent' }
  }, { idGenerator })
  assert.ok(wrapResult.ok)

  const nextTree = wrapResult.data.tree
  const parentId = wrapResult.data.nodeId
  const childId = childResult.data.nodeId

  assert.equal(nextTree.nodes[parentId].parentId, nextTree.rootId)
  assert.equal(nextTree.nodes[parentId].side, 'left')
  assert.equal(nextTree.nodes[childId].parentId, parentId)
  assert.deepEqual(nextTree.children[parentId], [childId])
  assert.equal(nextTree.children[nextTree.rootId][0], parentId)
})

test('createMindmapUpdateOps 将整树更新编译为 path scoped node.update record', () => {
  let nodeSeq = 1
  const idGenerator = {
    treeId: () => 'mindmap_update',
    nodeId: () => `node_${nodeSeq++}`
  }

  const beforeTree = createMindmap({ idGenerator })
  const addResult = addChild(
    beforeTree,
    beforeTree.rootId,
    { kind: 'text', text: 'child' },
    { side: 'right', idGenerator }
  )
  assert.ok(addResult.ok)

  const operations = createMindmapUpdateOps({
    beforeTree,
    afterTree: addResult.data.tree,
    node: {
      id: beforeTree.id,
      type: 'mindmap',
      position: { x: 0, y: 0 },
      data: {
        title: 'keep-root-fields'
      }
    }
  })

  assert.deepEqual(operations[0], {
    type: 'node.update',
    id: beforeTree.id,
    update: {
      records: [{
        scope: 'data',
        op: 'set',
        path: 'mindmap',
        value: addResult.data.tree
      }]
    }
  })
})
