const test = require('node:test')
const assert = require('node:assert/strict')

const {
  columnBeforeId,
  rowDragIds,
  rowSelectionTarget,
  sameRowHint
} = require('../.tmp/group-test-dist/table/index.js')

test('column reorder resolves the beforeId after moving a column', () => {
  assert.equal(columnBeforeId({
    columnIds: ['a', 'b', 'c', 'd'],
    sourceId: 'a',
    overId: 'c'
  }), 'd')

  assert.equal(columnBeforeId({
    columnIds: ['a', 'b', 'c', 'd'],
    sourceId: 'd',
    overId: 'a'
  }), 'a')
})

test('column reorder returns undefined for no-op or invalid input', () => {
  assert.equal(columnBeforeId({
    columnIds: ['a', 'b', 'c'],
    sourceId: 'b',
    overId: 'b'
  }), undefined)

  assert.equal(columnBeforeId({
    columnIds: ['a', 'b', 'c'],
    sourceId: 'x',
    overId: 'b'
  }), undefined)
})

test('row reorder drag ids keep visible selected rows when dragging a selected row', () => {
  assert.deepStrictEqual(rowDragIds({
    activeId: 'row-2',
    selectedRowIds: ['row-1', 'row-2', 'row-2', 'row-4'],
    visibleRowIdSet: new Set(['row-1', 'row-2', 'row-3'])
  }), ['row-1', 'row-2'])

  assert.deepStrictEqual(rowDragIds({
    activeId: 'row-3',
    selectedRowIds: ['row-1', 'row-2'],
    visibleRowIdSet: new Set(['row-1', 'row-2', 'row-3'])
  }), ['row-3'])
})

test('row reorder selection target only keeps the active row for single-row unselected drags', () => {
  assert.equal(rowSelectionTarget({
    activeId: 'row-3',
    dragIds: ['row-3'],
    selectedRowIds: ['row-1']
  }), 'row-3')

  assert.equal(rowSelectionTarget({
    activeId: 'row-2',
    dragIds: ['row-1', 'row-2'],
    selectedRowIds: ['row-1', 'row-2']
  }), null)
})

test('row reorder hint equality only depends on boundary and top offset', () => {
  assert.equal(sameRowHint(
    {
      beforeId: 'row-2',
      top: 120
    },
    {
      beforeId: 'row-2',
      top: 120
    }
  ), true)

  assert.equal(sameRowHint(
    {
      beforeId: 'row-2',
      top: 120
    },
    {
      beforeId: 'row-3',
      top: 120
    }
  ), false)
})
