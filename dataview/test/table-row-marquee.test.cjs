const test = require('node:test')
const assert = require('node:assert/strict')

const {
  mountedRowIdAtPoint,
  mountedRowGapAtPoint,
  mountedRowRangeInBox
} = require('../.tmp/group-test-dist/react/table/dom/rowHit.js')

const createContainer = rowRects => ({
  scrollLeft: 0,
  scrollTop: 0,
  getBoundingClientRect: () => ({
    left: 0,
    top: 0,
    right: 200,
    bottom: 320
  }),
  querySelectorAll: () => rowRects.map(rect => ({
    dataset: {
      rowId: rect.rowId
    },
    getBoundingClientRect: () => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom
    })
  }))
})

const rowIds = ['row-1', 'row-2']

const container = createContainer([
  {
    rowId: 'row-1',
    left: 0,
    right: 200,
    top: 40,
    bottom: 80
  },
  {
    rowId: 'row-2',
    left: 0,
    right: 200,
    top: 120,
    bottom: 160
  }
])

test('mounted row box intersections skip group header gaps', () => {
  const result = mountedRowRangeInBox({
    container,
    rowIds,
    box: {
      left: 20,
      right: 160,
      top: 90,
      bottom: 130
    }
  })

  assert.deepStrictEqual(result, {
    topRowId: 'row-2',
    bottomRowId: 'row-2'
  })
})

test('mounted row box intersections treat a point box inside a row as a hit', () => {
  const result = mountedRowRangeInBox({
    container,
    rowIds,
    box: {
      left: 40,
      right: 40,
      top: 125,
      bottom: 125
    }
  })

  assert.deepStrictEqual(result, {
    topRowId: 'row-2',
    bottomRowId: 'row-2'
  })
})

test('mounted row box intersections return visible top and bottom rows', () => {
  const result = mountedRowRangeInBox({
    container,
    rowIds,
    box: {
      left: 20,
      right: 160,
      top: 50,
      bottom: 140
    }
  })

  assert.deepStrictEqual(result, {
    topRowId: 'row-1',
    bottomRowId: 'row-2'
  })
})

test('mounted row hover hit extends into the leading gutter', () => {
  const gutterContainer = createContainer([
    {
      rowId: 'row-1',
      left: 60,
      right: 200,
      top: 40,
      bottom: 80
    }
  ])
  const result = mountedRowIdAtPoint({
    container: gutterContainer,
    rowIds: ['row-1'],
    point: {
      x: 20,
      y: 60
    }
  })

  assert.equal(result, 'row-1')
})

test('mounted row gap hit resolves the next visible row boundary', () => {
  const result = mountedRowGapAtPoint({
    container,
    rowIds,
    point: {
      x: 40,
      y: 100
    }
  })

  assert.deepStrictEqual(result, {
    beforeId: 'row-2',
    top: 120
  })
})

test('mounted row gap hit resolves the tail boundary after the last visible row', () => {
  const result = mountedRowGapAtPoint({
    container,
    rowIds,
    point: {
      x: 40,
      y: 220
    }
  })

  assert.deepStrictEqual(result, {
    beforeId: null,
    top: 160
  })
})
