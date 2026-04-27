import type {
  DataviewSpec
} from '@dataview/engine'
import {
  activeChangeSpec,
  documentChangeSpec
} from '@dataview/engine'
import {
  fieldKindSpec
} from '@dataview/core/field/kind/spec'
import {
  filterSpec
} from '@dataview/core/view/filterSpec'
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
  change: {
    document: documentChangeSpec,
    active: activeChangeSpec
  },
  viewTypes: viewTypeSpec,
  fieldKinds: fieldKindSpec,
  filters: filterSpec,
  fieldValues: fieldValueSpec,
  models: {
    page: pageModelSpec,
    card: cardModelSpec
  }
} as const satisfies DataviewSpec
