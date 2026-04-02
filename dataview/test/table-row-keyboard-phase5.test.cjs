const test = require('node:test')
const assert = require('node:assert/strict')

const {
  handleTableKey
} = require('../.tmp/group-test-dist/react/table/input.js')
const {
  applyRowCheckboxSelection
} = require('../.tmp/group-test-dist/react/table/components/row/Row.js')
const {
  gridSelection
} = require('../.tmp/group-test-dist/table/index.js')
const {
  createAppearances,
  createProperties
} = require('../.tmp/group-test-dist/engine/projection/view/index.js')
const {
  selection
} = require('../.tmp/group-test-dist/react/view/selection.js')
const {
  createValueStore
} = require('../.tmp/group-test-dist/runtime/store/index.js')

const row1 = 'record-1'
const row2 = 'record-2'
const order = [row1, row2]
const appearances = createAppearances({
  byId: new Map(order.map(rowId => [rowId, {
    id: rowId,
    recordId: rowId,
    section: 'root'
  }])),
  sections: [{
    key: 'root',
    title: 'All',
    ids: order,
    collapsed: false
  }]
})
const properties = createProperties({
  propertyIds: ['field-1'],
  byId: new Map([
    ['field-1', {
      id: 'field-1',
      name: 'field-1',
      kind: 'text',
      config: {
        type: 'text'
      }
    }]
  ])
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

const createGridSelection = () => {
  let current = null

  return {
    get: () => current,
    clear: () => {
      current = null
    },
    set: (cell, anchor = cell) => {
      current = gridSelection.set(cell, anchor)
    },
    move: (rowDelta, columnDelta, options) => {
      current = gridSelection.move(
        current,
        rowDelta,
        columnDelta,
        appearances,
        properties,
        options
      )
    },
    first: rowId => {
      current = gridSelection.set({
        appearanceId: rowId,
        propertyId: 'field-1'
      })
    }
  }
}

const createCurrentView = () => {
  const store = createValueStore({
    initial: selection.set(order, [row1], {
      anchor: row1,
      focus: row1
    }),
    isEqual: selection.equal
  })
  let removeCount = 0

  return {
    view: {
      id: 'view-1'
    },
    appearances,
    properties,
    selection: store,
    commands: {
      selection: {
        all: () => {
          store.set(selection.all(order))
        },
        set: (ids, options) => {
          store.set(selection.set(order, ids, options))
        },
        toggle: ids => {
          store.set(selection.toggle(order, store.get(), ids))
        },
        extend: to => {
          store.set(selection.extend(order, store.get(), to))
        }
      },
      mutation: {
        remove: () => {
          removeCount += 1
        }
      }
    },
    removeCount: () => removeCount
  }
}

test('table row keyboard movement and enter are routed through currentView and local cells', () => {
  const localGridSelection = createGridSelection()
  const currentView = createCurrentView()
  const editor = {
    records: {
      clearValues: () => {
        throw new Error('clearValues should not be called in row scope')
      }
    }
  }

  assert.equal(handleTableKey({
    key: key('ArrowDown'),
    editor,
    currentView,
    locked: false,
    readCell: () => ({
      exists: true
    }),
    gridSelection: localGridSelection,
    openCell: () => {
      throw new Error('openCell should not be called in row scope')
    },
    reveal: () => undefined,
    setKeyboardMode: () => undefined
  }), true)

  assert.deepStrictEqual(currentView.selection.get(), {
    ids: [row2],
    anchor: row2,
    focus: row2
  })

  assert.equal(handleTableKey({
    key: key('Enter'),
    editor,
    currentView,
    locked: false,
    readCell: () => ({
      exists: true
    }),
    gridSelection: localGridSelection,
    openCell: () => {
      throw new Error('openCell should not be called for row enter')
    },
    reveal: () => undefined,
    setKeyboardMode: () => undefined
  }), true)

  assert.deepStrictEqual(localGridSelection.get(), {
    focus: {
      appearanceId: row2,
      propertyId: 'field-1'
    },
    anchor: {
      appearanceId: row2,
      propertyId: 'field-1'
    }
  })
})

test('cell movement keeps row selection unchanged while updating local cell selection', () => {
  const localGridSelection = createGridSelection()
  const currentView = createCurrentView()
  localGridSelection.set({
    appearanceId: row1,
    propertyId: 'field-1'
  })

  assert.equal(handleTableKey({
    key: key('ArrowDown'),
    editor: {
      records: {
        clearValues: () => {
          throw new Error('clearValues should not be called while moving cells')
        }
      }
    },
    currentView,
    locked: false,
    readCell: () => ({
      exists: true
    }),
    gridSelection: localGridSelection,
    openCell: () => {
      throw new Error('openCell should not be called while moving cells')
    },
    reveal: () => undefined,
    setKeyboardMode: () => undefined
  }), true)

  assert.deepStrictEqual(localGridSelection.get(), {
    focus: {
      appearanceId: row2,
      propertyId: 'field-1'
    },
    anchor: {
      appearanceId: row2,
      propertyId: 'field-1'
    }
  })
  assert.deepStrictEqual(currentView.selection.get(), {
    ids: [row1],
    anchor: row1,
    focus: row1
  })
})

test('row checkbox toggles selection without requiring modifier keys', () => {
  const currentView = createCurrentView()

  applyRowCheckboxSelection({
    currentView,
    rowId: row2,
    shiftKey: false
  })
  assert.deepStrictEqual(currentView.selection.get(), {
    ids: [row1, row2],
    anchor: row1,
    focus: row1
  })

  applyRowCheckboxSelection({
    currentView,
    rowId: row1,
    shiftKey: false
  })
  assert.deepStrictEqual(currentView.selection.get(), {
    ids: [row2],
    anchor: row2,
    focus: row2
  })
})

test('table row delete is routed through currentView mutation commands', () => {
  const localGridSelection = createGridSelection()
  const currentView = createCurrentView()

  assert.equal(handleTableKey({
    key: key('Delete'),
    editor: {
      records: {
        clearValues: () => {
          throw new Error('clearValues should not be called in row scope')
        }
      }
    },
    currentView,
    locked: false,
    readCell: () => ({
      exists: true
    }),
    gridSelection: localGridSelection,
    openCell: () => {
      throw new Error('openCell should not be called on row delete')
    },
    reveal: () => undefined,
    setKeyboardMode: () => undefined
  }), true)

  assert.equal(currentView.removeCount(), 1)
})
