const test = require('node:test')
const assert = require('node:assert/strict')

const {
  rowMarqueeMode,
  rowMarqueeState,
  rowMarqueeSelection
} = require('../.tmp/group-test-dist/react/table/model/marquee.js')

test('row marquee selection mode prefers shift over toggle modifiers', () => {
  assert.equal(rowMarqueeMode({
    shiftKey: true,
    metaKey: true,
    ctrlKey: true
  }), 'range')

  assert.equal(rowMarqueeMode({
    shiftKey: false,
    metaKey: true,
    ctrlKey: false
  }), 'toggle')

  assert.equal(rowMarqueeMode({
    shiftKey: false,
    metaKey: false,
    ctrlKey: false
  }), 'replace')
})

test('row marquee locks the start edge and updates the current edge while dragging', () => {
  const first = rowMarqueeState({
    previous: {
      startEdge: null,
      currentEdge: null
    },
    edge: 2
  })

  const second = rowMarqueeState({
    previous: first,
    edge: 7
  })

  assert.deepStrictEqual(first, {
    startEdge: 2,
    currentEdge: 2
  })

  assert.deepStrictEqual(second, {
    startEdge: 2,
    currentEdge: 7
  })
})

test('row marquee expands a downward edge range into a continuous row slice', () => {
  assert.deepStrictEqual(rowMarqueeSelection({
    rowIds: ['row-1', 'row-2', 'row-3', 'row-4', 'row-5', 'row-6', 'row-7'],
    state: {
      startEdge: 1,
      currentEdge: 7
    }
  }), {
    ids: ['row-2', 'row-3', 'row-4', 'row-5', 'row-6', 'row-7'],
    anchor: 'row-2',
    focus: 'row-7'
  })
})

test('row marquee expands an upward edge range into a continuous row slice', () => {
  assert.deepStrictEqual(rowMarqueeSelection({
    rowIds: ['row-1', 'row-2', 'row-3', 'row-4', 'row-5', 'row-6', 'row-7'],
    state: {
      startEdge: 6,
      currentEdge: 2
    }
  }), {
    ids: ['row-3', 'row-4', 'row-5', 'row-6'],
    anchor: 'row-6',
    focus: 'row-3'
  })
})

test('row marquee keeps the previous edges when the current pointer cannot resolve a boundary', () => {
  const state = rowMarqueeState({
    previous: {
      startEdge: 2,
      currentEdge: 7
    },
    edge: null
  })

  assert.deepStrictEqual(state, {
    startEdge: 2,
    currentEdge: 7
  })
})

test('row marquee keeps an empty selection until the pointer crosses a different boundary', () => {
  assert.deepStrictEqual(rowMarqueeSelection({
    rowIds: ['row-1', 'row-2'],
    state: {
      startEdge: 1,
      currentEdge: 1
    }
  }), {
    ids: []
  })
})
