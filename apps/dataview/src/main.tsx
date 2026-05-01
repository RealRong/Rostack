import '@shared/ui/css/core.css'
import './styles.css'

import { createRoot } from 'react-dom/client'
import {
  type DataDoc,
  type CustomField,
  TITLE_FIELD_ID
} from '@dataview/core/types'
import { view } from '@dataview/core/view'
import { createEngine } from '@dataview/engine'
import { DataViewProvider, Page, dataviewSpec } from '@dataview/react'
import { I18nProvider } from '@shared/i18n/react'
import { entityTable } from '@shared/core'

const FIELD_STATUS = 'status'
const FIELD_POINTS = 'points'

const VIEW_TABLE = 'view_table'
const VIEW_KANBAN = 'view_kanban'

const STATUS_OPTIONS = [
  {
    id: 'todo',
    name: 'Todo',
    color: 'gray',
    category: 'todo'
  },
  {
    id: 'doing',
    name: 'In Progress',
    color: 'blue',
    category: 'in_progress'
  },
  {
    id: 'done',
    name: 'Done',
    color: 'green',
    category: 'complete'
  }
] as const

const createFields = (): CustomField[] => ([
  {
    id: FIELD_STATUS,
    name: 'Status',
    kind: 'status',
    defaultOptionId: 'todo',
    options: STATUS_OPTIONS.map(option => ({ ...option }))
  },
  {
    id: FIELD_POINTS,
    name: 'Points',
    kind: 'number',
    format: 'number',
    precision: null,
    currency: null,
    useThousandsSeparator: false
  }
])

const createFieldTable = (
  fields: readonly CustomField[]
): DataDoc['fields'] => {
  const byId = {} as DataDoc['fields']['byId']

  fields.forEach(field => {
    byId[field.id] = field
  })

  return {
    byId,
    ids: fields.map(field => field.id)
  }
}

const createDefaultDocument = (): DataDoc => {
  const count = 180
  const fields = createFields()
  const tableFieldIds = [TITLE_FIELD_ID, ...fields.map(field => field.id)]
  const fieldTable = createFieldTable(fields)
  const records: DataDoc['records'] = {
    byId: {},
    ids: []
  }

  for (let index = 0; index < count; index += 1) {
    const id = `rec_${String(index + 1).padStart(5, '0')}`
    records.byId[id] = {
      id,
      title: `Task ${String(index + 1).padStart(5, '0')}`,
      type: 'task',
      values: {
        [FIELD_STATUS]: STATUS_OPTIONS[Math.floor(Math.random() * STATUS_OPTIONS.length)]?.id ?? 'todo',
        [FIELD_POINTS]: Math.floor(Math.random() * 13) + 1
      }
    }
    records.ids.push(id)
  }

  return {
    schemaVersion: 1,
    fields: fieldTable,
    views: {
      byId: {
        [VIEW_TABLE]: {
          id: VIEW_TABLE,
          type: 'table',
          name: 'Tasks',
          filter: {
            mode: 'and',
            rules: entityTable.normalize.list([])
          },
          search: {
            query: ''
          },
          sort: {
            rules: entityTable.normalize.list([])
          },
          calc: {},
          display: {
            fields: tableFieldIds
          },
          options: {
            ...view.options.defaults('table', fields)
          },
          orders: []
        },
        [VIEW_KANBAN]: {
          id: VIEW_KANBAN,
          type: 'kanban',
          name: 'Board',
          filter: {
            mode: 'and',
            rules: entityTable.normalize.list([])
          },
          search: {
            query: ''
          },
          sort: {
            rules: entityTable.normalize.list([])
          },
          group: {
            fieldId: FIELD_STATUS,
            mode: 'option',
            bucketSort: 'manual'
          },
          calc: {},
          display: {
            fields: [FIELD_POINTS]
          },
          options: {
            ...view.options.defaults('kanban', fields)
          },
          orders: []
        }
      },
      ids: [VIEW_TABLE, VIEW_KANBAN]
    },
    records,
    meta: {
      demo: true,
      title: 'Group React Demo',
      statuses: STATUS_OPTIONS.map(option => option.id)
    }
  }
}

const syncSystemTheme = () => {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = () => {
    const theme = media.matches ? 'dark' : 'light'
    document.documentElement.classList.toggle('ui-dark-theme', theme === 'dark')
    document.documentElement.classList.toggle('ui-light-theme', theme !== 'dark')
  }

  apply()

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', apply)
    return
  }

  media.addListener(apply)
}

const DemoTable = () => {
  return <Page />
}

const root = document.querySelector('#app')
if (!root) {
  throw new Error('Missing #app root element')
}

syncSystemTheme()

const engine = createEngine({
  document: createDefaultDocument(),
  spec: dataviewSpec
})

createRoot(root).render(
  <I18nProvider lang="en">
    <DataViewProvider engine={engine}>
      <DemoTable />
    </DataViewProvider>
  </I18nProvider>
)
