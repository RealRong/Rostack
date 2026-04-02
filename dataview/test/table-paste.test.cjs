const test = require('node:test')
const assert = require('node:assert/strict')

const {
  applyPaste
} = require('../.tmp/group-test-dist/react/table/input.js')
const {
  gridSelection
} = require('../.tmp/group-test-dist/table/index.js')
const {
  createAppearances,
  createProperties
} = require('../.tmp/group-test-dist/engine/projection/view/index.js')

const row1 = 'record-1'
const row2 = 'record-2'

const rowIds = [row1, row2]

const createCurrentView = columns => ({
  appearances: createAppearances({
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
  }),
  properties: createProperties({
    propertyIds: columns.map(column => column.id),
    byId: new Map(columns.map(column => [column.id, {
      id: column.id,
      name: column.id,
      kind: column.kind,
      config: {
        type: column.kind
      }
    }]))
  })
})

const defaultColumns = [
  {
    id: 'field-1',
    kind: 'text'
  },
  {
    id: 'field-2',
    kind: 'number'
  }
]

const cell = (appearanceId, propertyId) => ({
  appearanceId,
  propertyId
})

const createInput = (columns = defaultColumns) => {
  const calls = {
    clearValue: [],
    setValue: []
  }

  return {
    input: {
      editor: {
        records: {
          clearValue: (recordId, propertyId) => {
            calls.clearValue.push({
              recordId,
              propertyId
            })
          },
          setValue: (recordId, propertyId, value) => {
            calls.setValue.push({
              recordId,
              propertyId,
              value
            })
          }
        }
      },
      currentView: createCurrentView(columns)
    },
    calls
  }
}

test('table paste broadcasts a single value across the selected range', () => {
  const { input, calls } = createInput([
    {
      id: 'field-1',
      kind: 'text'
    },
    {
      id: 'field-2',
      kind: 'text'
    }
  ])

  const handled = applyPaste({
    ...input,
    gridSelection: gridSelection.set(
      cell(row2, 'field-2'),
      cell(row1, 'field-1')
    ),
    text: 'hello'
  })

  assert.equal(handled, true)
  assert.deepStrictEqual(calls.setValue, [
    {
      recordId: 'record-1',
      propertyId: 'field-1',
      value: 'hello'
    },
    {
      recordId: 'record-1',
      propertyId: 'field-2',
      value: 'hello'
    },
    {
      recordId: 'record-2',
      propertyId: 'field-1',
      value: 'hello'
    },
    {
      recordId: 'record-2',
      propertyId: 'field-2',
      value: 'hello'
    }
  ])
  assert.deepStrictEqual(calls.clearValue, [])
})

test('table paste applies clears and writes from the pasted matrix', () => {
  const { input, calls } = createInput()

  const handled = applyPaste({
    ...input,
    gridSelection: gridSelection.set(
      cell(row1, 'field-1')
    ),
    text: 'alpha\t'
  })

  assert.equal(handled, true)
  assert.deepStrictEqual(calls.setValue, [{
    recordId: 'record-1',
    propertyId: 'field-1',
    value: 'alpha'
  }])
  assert.deepStrictEqual(calls.clearValue, [{
    recordId: 'record-1',
    propertyId: 'field-2'
  }])
})

test('table paste ignores empty clipboard text', () => {
  const { input, calls } = createInput()

  const handled = applyPaste({
    ...input,
    gridSelection: gridSelection.set(
      cell(row1, 'field-1')
    ),
    text: ''
  })

  assert.equal(handled, false)
  assert.deepStrictEqual(calls.setValue, [])
  assert.deepStrictEqual(calls.clearValue, [])
})
