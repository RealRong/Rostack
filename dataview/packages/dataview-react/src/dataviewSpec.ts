import type {
  DataviewSpec
} from '@dataview/engine'
import {
  fieldKindSpec
} from '@dataview/core/field/kind/spec'
import {
  filterConfig
} from '@dataview/core/view/filter'
import {
  viewTypeSpec
} from '@dataview/core/view'
import {
  cardModelSpec,
  pageModelSpec
} from '@dataview/runtime'
import {
  fieldValueSpec
} from '@dataview/react/field/value'

export const dataviewSpec = {
  viewTypes: viewTypeSpec,
  fieldKinds: fieldKindSpec,
  filters: filterConfig,
  fieldValues: fieldValueSpec,
  models: {
    page: pageModelSpec,
    card: cardModelSpec
  }
} as const satisfies DataviewSpec
