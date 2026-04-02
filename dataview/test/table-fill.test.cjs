const test = require('node:test')
const assert = require('node:assert/strict')

const { gridSelection } = require('../.tmp/group-test-dist/table/gridSelection.js')
const { fill } = require('../.tmp/group-test-dist/table/fill.js')
const {
  createAppearances,
  createProperties
} = require('../.tmp/group-test-dist/engine/projection/view/index.js')

const row1 = 'r1'
const row2 = 'r2'

const rowIds = [row1, row2]
const propertyIds = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6']
const appearances = createAppearances({
  byId: new Map(rowIds.map(rowId => [rowId, {
    id: rowId,
    recordId: rowId,
    section: 'root'
  }])),
  sections: [{
    key: 'root',
    title: 'All',
    ids: rowIds,
    collapsed: false
  }]
})
const properties = createProperties({
  propertyIds,
  byId: new Map(propertyIds.map(propertyId => [propertyId, {
    id: propertyId,
    name: propertyId,
    kind: 'text',
    config: {
      type: 'text'
    }
  }]))
})

const cell = (appearanceId, propertyId) => ({
  appearanceId,
  propertyId
})

const keyOf = input => `${input.appearanceId}\u0000${input.propertyId}`

const readSource = (() => {
  const values = new Map([
    [keyOf(cell(row1, 'f1')), 'v1'],
    [keyOf(cell(row1, 'f2')), 'v2'],
    [keyOf(cell(row1, 'f3')), 'v3'],
    [keyOf(cell(row1, 'f4')), 'v4'],
    [keyOf(cell(row1, 'f5')), 'v5'],
    [keyOf(cell(row1, 'f6')), 'v6']
  ])

  return nextCell => ({
    exists: true,
    value: values.get(keyOf(nextCell))
  })
})()

test('fill handle follows focus for forward and reverse single-row selection', () => {
  const forward = gridSelection.set(
    cell(row1, 'f6'),
    cell(row1, 'f1')
  )
  const reverse = gridSelection.set(
    cell(row1, 'f1'),
    cell(row1, 'f6')
  )

  assert.deepStrictEqual(
    fill.handleCell(forward, appearances, properties),
    cell(row1, 'f6')
  )
  assert.deepStrictEqual(
    fill.handleCell(reverse, appearances, properties),
    cell(row1, 'f1')
  )
})

test('reverse single-row selection keeps the full source span when filling downward', () => {
  const fillSelection = gridSelection.set(
    cell(row2, 'f1'),
    cell(row1, 'f6')
  )

  assert.deepStrictEqual(
    fill.plan(fillSelection, appearances, properties, readSource),
    [
      { cell: cell(row2, 'f1'), value: 'v1' },
      { cell: cell(row2, 'f2'), value: 'v2' },
      { cell: cell(row2, 'f3'), value: 'v3' },
      { cell: cell(row2, 'f4'), value: 'v4' },
      { cell: cell(row2, 'f5'), value: 'v5' },
      { cell: cell(row2, 'f6'), value: 'v6' }
    ]
  )
})
