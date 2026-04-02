const test = require('node:test')
const assert = require('node:assert/strict')

const {
  resolveAutoPanDelta,
  resolveDefaultAutoPanTargets,
  autoPanNodes
} = require('../.tmp/group-test-dist/react/runtime/interaction/autoPan.js')
const {
  pageScrollNode,
  scrollByClamped
} = require('../.tmp/group-test-dist/react/dom/scroll.js')

test('auto pan delta resolves leading and trailing edge pressure', () => {
  assert.equal(resolveAutoPanDelta({
    pointer: 10,
    start: 0,
    end: 100,
    edge: 20,
    maxStep: 10
  }), -5)

  assert.equal(resolveAutoPanDelta({
    pointer: 95,
    start: 0,
    end: 100,
    edge: 20,
    maxStep: 10
  }), 8)

  assert.equal(resolveAutoPanDelta({
    pointer: 50,
    start: 0,
    end: 100,
    edge: 20,
    maxStep: 10
  }), 0)
})

test('default auto pan targets use container on x and page scroll root on y', () => {
  const page = {
    id: 'page-scroll'
  }
  const container = {
    closest: selector => (
      selector === '[data-page-scroll]'
        ? page
        : null
    )
  }

  const targets = resolveDefaultAutoPanTargets(container)

  assert.equal(targets.x.node, container)
  assert.equal(targets.y.node, page)
})

test('auto pan nodes de-duplicate identical axis targets', () => {
  const node = {
    id: 'same'
  }

  assert.deepStrictEqual(autoPanNodes({
    x: {
      node
    },
    y: {
      node
    }
  }), [node])
})

test('page scroll node falls back to owner window when no page container exists', () => {
  const ownerWindow = {
    id: 'window'
  }
  const node = {
    closest: () => null,
    ownerDocument: {
      defaultView: ownerWindow
    }
  }

  assert.equal(pageScrollNode(node), ownerWindow)
})

test('scrollByClamped clamps element scroll deltas to scroll bounds', () => {
  const node = {
    scrollLeft: 10,
    scrollTop: 20,
    scrollWidth: 200,
    clientWidth: 80,
    scrollHeight: 160,
    clientHeight: 60
  }

  assert.deepStrictEqual(scrollByClamped({
    node,
    left: 200,
    top: -30
  }), {
    left: 110,
    top: -20
  })

  assert.equal(node.scrollLeft, 120)
  assert.equal(node.scrollTop, 0)
})
