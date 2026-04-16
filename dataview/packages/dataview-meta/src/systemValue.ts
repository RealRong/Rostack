import type {
  StatusCategory,
  SystemValueId
} from '@dataview/core/contracts'
import {
  token,
  type Token
} from '@shared/i18n'
import {
  defineMetaCollection
} from '@dataview/meta/shared'

export interface SystemValueDescriptor {
  id: SystemValueId | string
  token: Token
}

export interface StatusCategoryDescriptor {
  id: StatusCategory | string
  token: Token
}

const SYSTEM_VALUES = [
  {
    id: 'section.all',
    token: token('meta.systemValue.section.all', 'All')
  },
  {
    id: 'field.deleted',
    token: token('meta.systemValue.field.deleted', 'Deleted field')
  },
  {
    id: 'value.empty',
    token: token('meta.systemValue.value.empty', 'Empty')
  },
  {
    id: 'value.checked',
    token: token('meta.systemValue.value.checked', 'Checked')
  },
  {
    id: 'value.unchecked',
    token: token('meta.systemValue.value.unchecked', 'Unchecked')
  },
  {
    id: 'value.hasValue',
    token: token('meta.systemValue.value.hasValue', 'Has value')
  },
  {
    id: 'value.noValue',
    token: token('meta.systemValue.value.noValue', 'No value')
  },
  {
    id: 'date.today',
    token: token('meta.systemValue.date.today', 'Today')
  },
  {
    id: 'date.tomorrow',
    token: token('meta.systemValue.date.tomorrow', 'Tomorrow')
  },
  {
    id: 'date.yesterday',
    token: token('meta.systemValue.date.yesterday', 'Yesterday')
  }
] as const satisfies readonly SystemValueDescriptor[]

const STATUS_CATEGORIES = [
  {
    id: 'todo',
    token: token('meta.status.category.todo', 'To do')
  },
  {
    id: 'in_progress',
    token: token('meta.status.category.in_progress', 'In progress')
  },
  {
    id: 'complete',
    token: token('meta.status.category.complete', 'Complete')
  }
] as const satisfies readonly StatusCategoryDescriptor[]

export const systemValue = defineMetaCollection(SYSTEM_VALUES, {
  fallback: (id?: string) => ({
    id: id ?? 'value.empty',
    token: token('meta.systemValue.unknown', id ?? 'Unknown')
  })
})

export const status = {
  category: defineMetaCollection(STATUS_CATEGORIES, {
    fallback: (id?: string) => ({
      id: id ?? 'todo',
      token: token('meta.status.category.unknown', id ?? 'Unknown')
    })
  })
} as const
