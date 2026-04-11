import type { Engine } from '@dataview/engine'
import type { Field, FieldId } from '@dataview/core/contracts'
import { getDocumentFields } from '@dataview/core/document'
import {
  createDerivedStore,
  type ReadStore
} from '@shared/core'
import type {
  TableCurrentView
} from './currentView'
import {
  sameTableCurrentView
} from './currentView'

const createFieldLookup = (fields: readonly Field[]) => new Map<FieldId, Field>(
  fields.map(field => [field.id, field] as const)
)

export type TableViewProjection = TableCurrentView

export const createTableViewStore = (input: {
  engine: Engine
}): ReadStore<TableViewProjection | undefined> => createDerivedStore<TableViewProjection | undefined>({
  get: read => {
    const view = read(input.engine.active.view)
    const state = read(input.engine.active.state)
    const appearances = state?.appearances
    const sections = state?.sections
    const fields = state?.fields
    const calculationsBySection = state?.calculations
    if (
      !view
      || view.type !== 'table'
      || !appearances
      || !sections
      || !fields
      || !calculationsBySection
    ) {
      return undefined
    }

    return {
      view,
      fieldLookup: createFieldLookup(getDocumentFields(read(input.engine.read.document))),
      appearances,
      sections,
      fields,
      calculationsBySection
    }
  },
  isEqual: sameTableCurrentView
})
