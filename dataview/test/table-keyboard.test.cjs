const test = require('node:test')
const assert = require('node:assert/strict')

const {
  gridKeyAction
} = require('../.tmp/group-test-dist/table/index.js')
const {
  gridSelection
} = require('../.tmp/group-test-dist/table/index.js')
const {
  createAppearances,
  createProperties
} = require('../.tmp/group-test-dist/engine/projection/view/index.js')

const row1 = 'record-1'
const row2 = 'record-2'
const row3 = 'section:done\u0000record:record-1\u0000slot:0'

const rowIds = [row1, row2, row3]
const propertyIds = ['field-1', 'field-2']
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

const key = (value, overrides = {}) => ({
  key: value,
  modifiers: {
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...overrides
  }
})

const read = (options = {}) => ({
  cell: () => ({
    exists: options.exists ?? true
  }),
  property: () => options.property ?? {
    id: 'field-1',
    kind: 'text'
  }
})

test('table keyboard resolves printable cell input to open-cell with seed draft', () => {
  const action = gridKeyAction({
    key: key('x'),
    selection: gridSelection.set({
      appearanceId: row1,
      propertyId: 'field-1'
    }),
    appearances,
    properties,
    read: read()
  })

  assert.deepStrictEqual(action, {
    kind: 'open-cell',
    cell: {
      appearanceId: row1,
      propertyId: 'field-1'
    },
    seedDraft: 'x'
  })
})

test('table keyboard resolves delete to clear-cells across the current range', () => {
  const action = gridKeyAction({
    key: key('Delete'),
    selection: gridSelection.set(
      {
        appearanceId: row2,
        propertyId: 'field-2'
      },
      {
        appearanceId: row1,
        propertyId: 'field-1'
      }
    ),
    appearances,
    properties,
    read: read()
  })

  assert.deepStrictEqual(action, {
    kind: 'clear-cells',
    appearanceIds: [row1, row2],
    propertyIds: ['field-1', 'field-2']
  })
})

test('table keyboard resolves tab to wrapped cell movement', () => {
  const action = gridKeyAction({
    key: key('Tab'),
    selection: gridSelection.set({
      appearanceId: row1,
      propertyId: 'field-2'
    }),
    appearances,
    properties,
    read: read()
  })

  assert.deepStrictEqual(action, {
    kind: 'move-cell',
    rowDelta: 0,
    columnDelta: 1,
    wrap: true
  })
})

test('table keyboard does not resolve printable edit for non-editable cells', () => {
  const action = gridKeyAction({
    key: key('x'),
    selection: gridSelection.set({
      appearanceId: row1,
      propertyId: 'field-1'
    }),
    appearances,
    properties,
    read: read({
      exists: false
    })
  })

  assert.equal(action, null)
})
