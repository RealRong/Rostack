const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createValueStore,
  createKeyedReadStore
} = require('../.tmp/group-test-dist/runtime/store/index.js')
const {
  createAppearances
} = require('../.tmp/group-test-dist/engine/projection/view/appearances.js')
const {
  createFields
} = require('../.tmp/group-test-dist/engine/projection/view/fields.js')
const {
  createCellRender
} = require('../.tmp/group-test-dist/react/views/table/cellRender.js')

const createStaticKeyedStore = getter => createKeyedReadStore({
  get: getter,
  subscribe: () => () => {}
})

test('table cell render resolves title field values from record.title', () => {
  const titleField = {
    id: 'title',
    name: 'Title',
    kind: 'title',
    system: true
  }
  const appearances = createAppearances({
    byId: new Map([
      ['appearance-1', {
        id: 'appearance-1',
        recordId: 'record-1',
        section: 'root'
      }]
    ]),
    sections: [{
      key: 'root',
      title: 'All',
      ids: ['appearance-1'],
      collapsed: false
    }]
  })
  const fields = createFields({
    fieldIds: ['title'],
    byId: new Map([
      ['title', titleField]
    ])
  })
  const currentViewStore = createValueStore({
    initial: {
      appearances,
      fields,
      sections: [],
      view: {
        id: 'view-1',
        query: {
          sorters: []
        }
      }
    }
  })
  const cellRender = createCellRender({
    gridSelectionStore: createValueStore({
      initial: null
    }),
    valueEditorOpenStore: createValueStore({
      initial: false
    }),
    currentViewStore,
    capabilitiesStore: createValueStore({
      initial: {
        canHover: true,
        canRowDrag: true,
        canColumnResize: true,
        showFillHandle: false
      }
    }),
    hoverCellStore: createStaticKeyedStore(() => false),
    recordStore: createStaticKeyedStore(recordId => (
      recordId === 'record-1'
        ? {
            id: 'record-1',
            title: 'Alpha',
            values: {}
          }
        : undefined
    ))
  })

  assert.deepStrictEqual(cellRender.get({
    appearanceId: 'appearance-1',
    fieldId: 'title'
  }), {
    exists: true,
    value: 'Alpha',
    selected: false,
    chrome: {
      selection: false,
      frame: false,
      hover: false,
      fill: false
    }
  })
})
