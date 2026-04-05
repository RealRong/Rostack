import '@ui/css/core.css'
import './styles.css'

import { createRoot } from 'react-dom/client'
import {
  createDefaultGroupViewOptions,
  createGroupEngine,
  type GroupDocument,
  type GroupProperty
} from '@dataview'
import { EngineProvider, Page } from '@dataview/react'

const FIELD_TITLE = 'title'
const FIELD_STATUS = 'status'
const FIELD_POINTS = 'points'

const VIEW_TABLE = 'view_table'
const VIEW_KANBAN = 'view_kanban'

const STATUS_OPTIONS = [
  {
    id: 'todo',
    key: 'todo',
    name: 'Todo',
    color: 'gray'
  },
  {
    id: 'doing',
    key: 'doing',
    name: 'In Progress',
    color: 'blue'
  },
  {
    id: 'done',
    key: 'done',
    name: 'Done',
    color: 'green'
  }
] as const

const createProperties = (): GroupProperty[] => ([
  {
    id: FIELD_TITLE,
    name: 'Title',
    kind: 'text',
    config: {
      type: 'text'
    }
  },
  {
    id: FIELD_STATUS,
    name: 'Status',
    kind: 'select',
    config: {
      type: 'select',
      options: STATUS_OPTIONS.map(option => ({ ...option }))
    }
  },
  {
    id: FIELD_POINTS,
    name: 'Points',
    kind: 'number',
    config: {
      type: 'number',
      format: 'number'
    }
  }
])

const createPropertyTable = (
  properties: readonly GroupProperty[]
): GroupDocument['properties'] => {
  const byId = {} as GroupDocument['properties']['byId']

  properties.forEach(property => {
    byId[property.id] = property
  })

  return {
    byId,
    order: properties.map(property => property.id)
  }
}

const createDefaultDocument = (): GroupDocument => {
  const count = 180
  const properties = createProperties()
  const propertyTable = createPropertyTable(properties)
  const records: GroupDocument['records'] = {
    byId: {},
    order: []
  }

  for (let index = 0; index < count; index += 1) {
    const id = `rec_${String(index + 1).padStart(5, '0')}`
    records.byId[id] = {
      id,
      type: 'task',
      values: {
        [FIELD_TITLE]: `Task ${String(index + 1).padStart(5, '0')}`,
        [FIELD_STATUS]: STATUS_OPTIONS[Math.floor(Math.random() * STATUS_OPTIONS.length)]?.id ?? 'todo',
        [FIELD_POINTS]: Math.floor(Math.random() * 13) + 1
      }
    }
    records.order.push(id)
  }

  return {
    schemaVersion: 1,
    properties: propertyTable,
    views: {
      byId: {
        [VIEW_TABLE]: {
          id: VIEW_TABLE,
          type: 'table',
          name: 'Tasks',
          query: {
            filter: {
              mode: 'and',
              rules: []
            },
            search: {
              query: ''
            },
            sorters: [
              {
                property: FIELD_TITLE,
                direction: 'asc'
              }
            ]
          },
          aggregates: [],
          options: createDefaultGroupViewOptions('table', properties),
          orders: []
        },
        [VIEW_KANBAN]: {
          id: VIEW_KANBAN,
          type: 'kanban',
          name: 'Board',
          query: {
            filter: {
              mode: 'and',
              rules: []
            },
            search: {
              query: ''
            },
            sorters: [],
            group: {
              property: FIELD_STATUS,
              mode: 'option',
              bucketSort: 'manual'
            }
          },
          aggregates: [],
          options: {
            ...createDefaultGroupViewOptions('kanban', properties),
            display: {
              propertyIds: [FIELD_TITLE, FIELD_POINTS]
            }
          },
          orders: []
        }
      },
      order: [VIEW_TABLE, VIEW_KANBAN]
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

const engine = createGroupEngine({
  document: createDefaultDocument()
})

createRoot(root).render(
  <EngineProvider engine={engine}>
    <DemoTable />
  </EngineProvider>
)
