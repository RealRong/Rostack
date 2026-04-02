const test = require('node:test')
const assert = require('node:assert/strict')

const { gridSelection } = require('../.tmp/group-test-dist/table/gridSelection.js')
const { selection } = require('../.tmp/group-test-dist/react/view/selection.js')
const {
  createAppearances,
  createProperties
} = require('../.tmp/group-test-dist/engine/projection/view/index.js')

const rowTodo = 'section:todo\u0000record:record-1\u0000slot:0'
const rowDone = 'section:done\u0000record:record-1\u0000slot:0'
const rowNext = 'section:todo\u0000record:record-2\u0000slot:0'

const orderIds = [rowTodo, rowDone, rowNext]
const appearances = createAppearances({
  byId: new Map(orderIds.map(rowId => [rowId, {
    id: rowId,
    recordId: rowId,
    section: 'root'
  }])),
  sections: [{
    key: 'root',
    title: 'All',
    ids: orderIds,
    collapsed: false
  }]
})
const properties = createProperties({
  propertyIds: ['field-1', 'field-2'],
  byId: new Map([
    ['field-1', {
      id: 'field-1',
      name: 'field-1',
      kind: 'text',
      config: {
        type: 'text'
      }
    }],
    ['field-2', {
      id: 'field-2',
      name: 'field-2',
      kind: 'text',
      config: {
        type: 'text'
      }
    }]
  ])
})

const cell = (appearanceId, propertyId) => ({
  appearanceId,
  propertyId
})

test('row selection is appearance-scoped, not record-scoped', () => {
  const selected = selection.set(orderIds, [rowTodo], {
    anchor: rowTodo,
    focus: rowTodo
  })

  assert.deepStrictEqual(selected.ids, [rowTodo])
})

test('table cell navigation moves across duplicate appearances of the same record', () => {
  const initial = gridSelection.set(cell(rowTodo, 'field-1'))
  const next = gridSelection.move(initial, 1, 0, appearances, properties)

  assert.deepStrictEqual(next?.anchor, cell(rowDone, 'field-1'))
})

test('row navigation uses appearance order even when record ids repeat', () => {
  const initial = selection.set(orderIds, [rowTodo], {
    anchor: rowTodo,
    focus: rowTodo
  })
  const next = selection.step(orderIds, initial, 1)

  assert.deepStrictEqual(next?.ids, [rowDone])
})
