import assert from 'node:assert/strict'
import { test } from 'vitest'
import { node as nodeApi, type Guide } from '@whiteboard/core/node'
import type { Node } from '@whiteboard/core/types'

const createNode = (
  id: string,
  overrides: Partial<Node> = {}
): Node => ({
  id,
  type: 'text',
  position: {
    x: 0,
    y: 0
  },
  size: {
    width: 100,
    height: 40
  },
  locked: false,
  ...overrides
})

const createGuide = (
  axis: 'x' | 'y'
): Guide => ({
  axis,
  value: 0,
  from: 0,
  to: 0,
  targetEdge: axis === 'x' ? 'left' : 'top',
  sourceEdge: axis === 'x' ? 'right' : 'bottom'
})

test('selection scale-xy keeps member aspect ratios after snap adjusts one axis', () => {
  const first = createNode('first', {
    style: {
      fontSize: 20
    }
  })
  const second = createNode('second', {
    style: {
      fontSize: 16
    }
  })

  const plan = nodeApi.transform.buildPlan({
    box: {
      x: 0,
      y: 0,
      width: 200,
      height: 100
    },
    members: [
      {
        id: first.id,
        node: first,
        rect: {
          x: 0,
          y: 0,
          width: 100,
          height: 40
        },
        behavior: nodeApi.transform.resolveBehavior(first, {
          role: 'content',
          resize: true
        })!
      },
      {
        id: second.id,
        node: second,
        rect: {
          x: 120,
          y: 10,
          width: 60,
          height: 60
        },
        behavior: nodeApi.transform.resolveBehavior(second, {
          role: 'content',
          resize: true
        })!
      }
    ]
  })

  assert.ok(plan)

  const state = nodeApi.transform.start({
    kind: 'selection-resize',
    pointerId: 1,
    plan,
    rotation: 0,
    handle: 'se',
    startScreen: {
      x: 0,
      y: 0
    }
  })
  const result = nodeApi.transform.step({
    state,
    screen: {
      x: 60,
      y: 0
    },
    world: {
      x: 0,
      y: 0
    },
    modifiers: {
      alt: false,
      shift: false
    },
    zoom: 1,
    minSize: {
      width: 20,
      height: 20
    },
    snap: () => ({
      rect: {
        x: 0,
        y: 0,
        width: 320,
        height: 120
      },
      guides: [createGuide('x'), createGuide('y')]
    })
  })

  const patches = result.draft.nodePatches
  const firstPatch = patches.find((patch) => patch.id === first.id)
  const secondPatch = patches.find((patch) => patch.id === second.id)

  assert.ok(firstPatch?.size)
  assert.ok(secondPatch?.size)
  assert.equal(firstPatch.size.width / firstPatch.size.height, 2.5)
  assert.equal(secondPatch.size.width / secondPatch.size.height, 1)
  assert.equal(firstPatch.fontSize, 24)
  assert.equal(secondPatch.fontSize, 19.2)
})

test('pure text multi-selection resize-x projects wrap width without vertical scaling', () => {
  const first = createNode('first', {
    style: {
      fontSize: 20
    }
  })
  const second = createNode('second', {
    style: {
      fontSize: 16
    }
  })

  const plan = nodeApi.transform.buildPlan({
    box: {
      x: 0,
      y: 0,
      width: 200,
      height: 100
    },
    members: [
      {
        id: first.id,
        node: first,
        rect: {
          x: 0,
          y: 0,
          width: 100,
          height: 40
        },
        behavior: nodeApi.transform.resolveBehavior(first, {
          role: 'content',
          resize: true
        })!
      },
      {
        id: second.id,
        node: second,
        rect: {
          x: 120,
          y: 10,
          width: 60,
          height: 60
        },
        behavior: nodeApi.transform.resolveBehavior(second, {
          role: 'content',
          resize: true
        })!
      }
    ]
  })

  assert.ok(plan)

  const state = nodeApi.transform.start({
    kind: 'selection-resize',
    pointerId: 1,
    plan,
    rotation: 0,
    handle: 'e',
    startScreen: {
      x: 0,
      y: 0
    }
  })
  const result = nodeApi.transform.step({
    state,
    screen: {
      x: 60,
      y: 0
    },
    world: {
      x: 0,
      y: 0
    },
    modifiers: {
      alt: false,
      shift: false
    },
    zoom: 1,
    minSize: {
      width: 20,
      height: 20
    },
    snap: () => ({
      rect: {
        x: 0,
        y: 0,
        width: 320,
        height: 100
      },
      guides: [createGuide('x'), createGuide('y')]
    })
  })

  const patches = result.draft.nodePatches
  const firstPatch = patches.find((patch) => patch.id === first.id)
  const secondPatch = patches.find((patch) => patch.id === second.id)

  assert.ok(firstPatch?.size)
  assert.ok(secondPatch?.size)
  assert.deepEqual(firstPatch, {
    id: first.id,
    position: {
      x: 0,
      y: 0
    },
    size: {
      width: 160,
      height: 40
    },
    handle: 'e',
    mode: 'wrap',
    wrapWidth: 160
  })
  assert.deepEqual(secondPatch, {
    id: second.id,
    position: {
      x: 192,
      y: 10
    },
    size: {
      width: 96,
      height: 60
    },
    handle: 'e',
    mode: 'wrap',
    wrapWidth: 96
  })
})

test('text resize-x commit writes wrap mode and wrap width', () => {
  const node = createNode('text-node', {
    data: {
      text: 'hello world'
    },
    size: {
      width: 180,
      height: 24
    }
  })

  const updates = nodeApi.transform.buildCommitUpdates({
    targets: [{
      id: node.id,
      node
    }],
    patches: [{
      id: node.id,
      size: {
        width: 120,
        height: 24
      },
      mode: 'wrap',
      wrapWidth: 120
    }]
  })

  assert.equal(updates.length, 1)
  assert.deepEqual(updates[0]?.update.fields, {
    size: {
      width: 120,
      height: 24
    }
  })
  assert.deepEqual(updates[0]?.update.record, {
    'data.widthMode': 'wrap',
    'data.wrapWidth': 120
  })
})

test('single text resize-x gesture produces wrap mode and wrap width updates', () => {
  const node = createNode('text-node', {
    data: {
      text: 'hello world'
    },
    size: {
      width: 100,
      height: 24
    }
  })
  const target = {
    id: node.id,
    node,
    rect: {
      x: 0,
      y: 0,
      width: 100,
      height: 24
    },
    behavior: nodeApi.transform.resolveBehavior(node, {
      role: 'content',
      resize: true
    })!
  }

  const state = nodeApi.transform.start({
    kind: 'single-resize',
    pointerId: 1,
    target,
    rotation: 0,
    handle: 'e',
    startScreen: {
      x: 0,
      y: 0
    }
  })

  const result = nodeApi.transform.step({
    state,
    screen: {
      x: 80,
      y: 0
    },
    world: {
      x: 0,
      y: 0
    },
    modifiers: {
      alt: false,
      shift: false
    },
    zoom: 1,
    minSize: {
      width: 20,
      height: 20
    }
  })

  assert.deepEqual(result.draft.nodePatches, [{
    id: node.id,
    position: {
      x: 0,
      y: 0
    },
    size: {
      width: 180,
      height: 24
    },
    handle: 'e',
    mode: 'wrap',
    wrapWidth: 180
  }])

  const updates = nodeApi.transform.finish(result.state)
  assert.equal(updates.length, 1)
  assert.deepEqual(updates[0]?.update.record, {
    'data.widthMode': 'wrap',
    'data.wrapWidth': 180
  })
})

test('single text scale gesture keeps uniform geometry during preview', () => {
  const node = createNode('text-node', {
    data: {
      text: 'hello world'
    },
    style: {
      fontSize: 14
    },
    size: {
      width: 100,
      height: 24
    }
  })
  const target = {
    id: node.id,
    node,
    rect: {
      x: 0,
      y: 0,
      width: 100,
      height: 24
    },
    behavior: nodeApi.transform.resolveBehavior(node, {
      role: 'content',
      resize: true
    })!
  }

  const state = nodeApi.transform.start({
    kind: 'single-resize',
    pointerId: 1,
    target,
    rotation: 0,
    handle: 'se',
    startScreen: {
      x: 0,
      y: 0
    }
  })

  const result = nodeApi.transform.step({
    state,
    screen: {
      x: 80,
      y: 0
    },
    world: {
      x: 0,
      y: 0
    },
    modifiers: {
      alt: false,
      shift: false
    },
    zoom: 1,
    minSize: {
      width: 20,
      height: 20
    }
  })

  assert.equal(result.draft.nodePatches.length, 1)
  const patch = result.draft.nodePatches[0]!
  assert.equal(patch.id, node.id)
  assert.deepEqual(patch.position, {
    x: 0,
    y: 0
  })
  assert.equal(patch.handle, 'se')
  assert.equal(patch.mode, 'auto')
  assert.equal(patch.wrapWidth, undefined)
  assert.ok(patch.size)
  assert.ok(patch.fontSize !== undefined)
  assert.ok(Math.abs((patch.size.width / patch.size.height) - (100 / 24)) < 0.000001)
  assert.ok(Math.abs((patch.fontSize / 14) - (patch.size.width / 100)) < 0.000001)
})

test('resolveSpec gates single-node transform by capability and handle family', () => {
  const node = createNode('text-node', {
    data: {
      text: 'hello world'
    }
  })
  const target = {
    id: node.id,
    node,
    rect: {
      x: 0,
      y: 0,
      width: 100,
      height: 24
    }
  }

  const resize = nodeApi.transform.resolveSpec({
    target,
    rotation: 0,
    handle: {
      kind: 'resize',
      direction: 'e'
    },
    pointerId: 1,
    startScreen: {
      x: 10,
      y: 20
    },
    startWorld: {
      x: 30,
      y: 40
    },
    capability: {
      role: 'content',
      resize: true,
      rotate: true
    }
  })
  assert.deepEqual(resize, {
    kind: 'single-resize',
    pointerId: 1,
    target,
    handle: 'e',
    rotation: 0,
    startScreen: {
      x: 10,
      y: 20
    }
  })

  assert.equal(nodeApi.transform.resolveSpec({
    target,
    rotation: 0,
    handle: {
      kind: 'resize',
      direction: 'n'
    },
    pointerId: 1,
    startScreen: {
      x: 10,
      y: 20
    },
    startWorld: {
      x: 30,
      y: 40
    },
    capability: {
      role: 'content',
      resize: true
    }
  }), undefined)

  assert.equal(nodeApi.transform.resolveSpec({
    target,
    rotation: 0,
    handle: {
      kind: 'rotate'
    },
    pointerId: 1,
    startScreen: {
      x: 10,
      y: 20
    },
    startWorld: {
      x: 30,
      y: 40
    },
    capability: {
      rotate: false
    }
  }), undefined)
})
