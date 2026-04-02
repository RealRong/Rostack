const test = require('node:test')
const assert = require('node:assert/strict')

const {
  finishCellEdit,
  createCellOpener
} = require('../.tmp/group-test-dist/react/table/openCell.js')
const {
  createAppearances,
  createProperties
} = require('../.tmp/group-test-dist/engine/projection/view/index.js')
const {
  keyAction
} = require('../.tmp/group-test-dist/react/properties/value/editor/shared/keyboard.js')

const createCurrentView = (propertyIds = ['field-1', 'field-2']) => ({
  view: {
    id: 'view-1'
  },
  appearances: createAppearances({
    byId: new Map([
      ['row-1', {
        id: 'row-1',
        recordId: 'record-1',
        section: 'root'
      }],
      ['row-2', {
        id: 'row-2',
        recordId: 'record-2',
        section: 'root'
      }]
    ]),
    sections: [{
      key: 'root',
      title: 'All',
      ids: ['row-1', 'row-2'],
      collapsed: false
    }]
  }),
  properties: createProperties({
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
})

const createTable = () => {
  const calls = {
    reveal: 0,
    focus: 0,
    setCells: [],
    reopened: []
  }
  const currentView = createCurrentView()
  const field = {
    viewId: 'view-1',
    appearanceId: 'row-1',
    recordId: 'record-1',
    propertyId: 'field-1'
  }

  return {
    table: {
      currentView,
      revealSelection: () => {
        calls.reveal += 1
      },
      focus: () => {
        calls.focus += 1
      },
      gridSelection: {
        set: cell => {
          calls.setCells.push(cell)
        }
      }
    },
    field,
    calls
  }
}

test('table editor cancel restores the edited field to selection', () => {
  const { table, field, calls } = createTable()

  finishCellEdit({
    currentView: table.currentView,
    field,
    result: {
      kind: 'cancel'
    },
    gridSelection: table.gridSelection,
    revealSelection: table.revealSelection,
    focus: table.focus,
    reopen: nextField => {
      calls.reopened.push(nextField)
      return true
    }
  })

  assert.deepStrictEqual(calls.setCells, [{
    appearanceId: 'row-1',
    propertyId: 'field-1'
  }])
  assert.deepStrictEqual(calls.reopened, [])
  assert.equal(calls.reveal, 1)
  assert.equal(calls.focus, 1)
})

test('table editor dismiss restores the edited field to selection', () => {
  const { table, field, calls } = createTable()

  finishCellEdit({
    currentView: table.currentView,
    field,
    result: {
      kind: 'dismiss'
    },
    gridSelection: table.gridSelection,
    revealSelection: table.revealSelection,
    focus: table.focus,
    reopen: nextField => {
      calls.reopened.push(nextField)
      return true
    }
  })

  assert.deepStrictEqual(calls.setCells, [{
    appearanceId: 'row-1',
    propertyId: 'field-1'
  }])
  assert.deepStrictEqual(calls.reopened, [])
  assert.equal(calls.reveal, 1)
  assert.equal(calls.focus, 1)
})

test('table editor commit with done restores the edited field to selection', () => {
  const { table, field, calls } = createTable()

  finishCellEdit({
    currentView: table.currentView,
    field,
    result: {
      kind: 'commit',
      intent: 'done'
    },
    gridSelection: table.gridSelection,
    revealSelection: table.revealSelection,
    focus: table.focus,
    reopen: nextField => {
      calls.reopened.push(nextField)
      return true
    }
  })

  assert.deepStrictEqual(calls.setCells, [{
    appearanceId: 'row-1',
    propertyId: 'field-1'
  }])
  assert.deepStrictEqual(calls.reopened, [])
  assert.equal(calls.reveal, 1)
  assert.equal(calls.focus, 1)
})

test('table editor next-field commit reopens the next field instead of restoring selection', () => {
  const { table, field, calls } = createTable()

  finishCellEdit({
    currentView: table.currentView,
    field,
    result: {
      kind: 'commit',
      intent: 'next-field'
    },
    gridSelection: table.gridSelection,
    revealSelection: table.revealSelection,
    focus: table.focus,
    reopen: nextField => {
      calls.reopened.push(nextField)
      return true
    }
  })

  assert.deepStrictEqual(calls.setCells, [])
  assert.deepStrictEqual(calls.reopened, [{
    viewId: 'view-1',
    appearanceId: 'row-1',
    recordId: 'record-1',
    propertyId: 'field-2'
  }])
  assert.equal(calls.reveal, 0)
  assert.equal(calls.focus, 0)
})

test('table editor falls back to restoring selection when traversal has no target', () => {
  const { table, calls } = createTable()
  const field = {
    viewId: 'view-1',
    appearanceId: 'row-1',
    recordId: 'record-1',
    propertyId: 'field-2'
  }

  finishCellEdit({
    currentView: table.currentView,
    field,
    result: {
      kind: 'commit',
      intent: 'next-field'
    },
    gridSelection: table.gridSelection,
    revealSelection: table.revealSelection,
    focus: table.focus,
    reopen: nextField => {
      calls.reopened.push(nextField)
      return true
    }
  })

  assert.deepStrictEqual(calls.setCells, [{
    appearanceId: 'row-1',
    propertyId: 'field-2'
  }])
  assert.deepStrictEqual(calls.reopened, [])
  assert.equal(calls.reveal, 1)
  assert.equal(calls.focus, 1)
})

test('editor enter key can map to next-item for table editing', () => {
  assert.deepStrictEqual(keyAction({
    key: 'Enter',
    shiftKey: false,
    composing: false,
    enterIntent: 'next-item'
  }), {
    type: 'submit',
    intent: 'next-item'
  })
})

test('editor enter key defaults to done outside table editing', () => {
  assert.deepStrictEqual(keyAction({
    key: 'Enter',
    shiftKey: false,
    composing: false
  }), {
    type: 'submit',
    intent: 'done'
  })
})

test('table next-item reopen syncs selection and reveal when next cell is already rendered', () => {
  const previousHTMLElement = globalThis.HTMLElement
  const restoreHTMLElement = () => {
    if (previousHTMLElement === undefined) {
      delete globalThis.HTMLElement
      return
    }

    globalThis.HTMLElement = previousHTMLElement
  }

  class FakeHTMLElement {}

  globalThis.HTMLElement = FakeHTMLElement

  try {
    const elements = []
    const ownerDocument = {
      querySelectorAll: () => elements
    }
    const createElement = field => {
      const element = new FakeHTMLElement()
      element.dataset = {
        propertyEditViewId: field.viewId,
        propertyEditAppearanceId: field.appearanceId,
        propertyEditRecordId: field.recordId,
        propertyEditPropertyId: field.propertyId
      }
      element.ownerDocument = ownerDocument
      element.getBoundingClientRect = () => ({
        left: 12,
        top: field.appearanceId === 'row-1' ? 40 : 960,
        width: 160
      })
      elements.push(element)
      return element
    }

    const currentView = createCurrentView(['field-1'])
    const row1 = createElement({
      viewId: 'view-1',
      appearanceId: 'row-1',
      recordId: 'record-1',
      propertyId: 'field-1'
    })
    const row2 = createElement({
      viewId: 'view-1',
      appearanceId: 'row-2',
      recordId: 'record-2',
      propertyId: 'field-1'
    })
    const calls = {
      opens: [],
      setCells: [],
      reveal: 0,
      focus: 0
    }
    let resolveCurrent = null

    const openCell = createCellOpener({
      propertyEdit: {
        open: input => {
          calls.opens.push(input)
          resolveCurrent = input.onResolve
          return true
        },
        close: () => {}
      },
      currentView: () => currentView,
      gridSelection: {
        set: cell => {
          calls.setCells.push(cell)
        }
      },
      dom: {
        cell: cell => cell.appearanceId === 'row-1' ? row1 : row2
      },
      revealCursor: () => {
        calls.reveal += 1
      },
      focus: () => {
        calls.focus += 1
      }
    })

    assert.equal(openCell({
      cell: {
        appearanceId: 'row-1',
        propertyId: 'field-1'
      }
    }), true)

    const beforeResolveSelectionCount = calls.setCells.length
    const beforeResolveRevealCount = calls.reveal

    assert.equal(typeof resolveCurrent, 'function')

    resolveCurrent({
      kind: 'commit',
      intent: 'next-item'
    })

    assert.equal(calls.opens.length, 2)
    assert.deepStrictEqual(calls.opens[1].field, {
      viewId: 'view-1',
      appearanceId: 'row-2',
      recordId: 'record-2',
      propertyId: 'field-1'
    })
    assert.ok(calls.setCells.length > beforeResolveSelectionCount)
    assert.deepStrictEqual(calls.setCells.at(-1), {
      appearanceId: 'row-2',
      propertyId: 'field-1'
    })
    assert.ok(calls.reveal > beforeResolveRevealCount)
  } finally {
    restoreHTMLElement()
  }
})
