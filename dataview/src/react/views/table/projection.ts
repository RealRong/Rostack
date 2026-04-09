import type { Engine } from '@dataview/engine'
import type { Field, FieldId } from '@dataview/core/contracts'
import { getDocumentFields } from '@dataview/core/document'
import {
  createDerivedStore,
  type ReadStore
} from '@shared/store'
import {
  sameViewProjection,
  type ViewProjection
} from '@dataview/engine/projection/view'

const createSchema = (fields: readonly Field[]) => ({
  fields: new Map<FieldId, Field>(
    fields.map(field => [field.id, field] as const)
  )
})

export type TableViewProjection = ViewProjection

export const createTableViewStore = (input: {
  engine: Engine
}): ReadStore<TableViewProjection | undefined> => createDerivedStore<TableViewProjection | undefined>({
  get: read => {
    const view = read(input.engine.read.activeView)
    const appearances = read(input.engine.project.appearances)
    const sections = read(input.engine.project.sections)
    const fields = read(input.engine.project.fields)
    const calculationsBySection = read(input.engine.project.calculations)
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
      schema: createSchema(getDocumentFields(read(input.engine.read.document))),
      appearances,
      sections,
      fields,
      calculationsBySection
    }
  },
  isEqual: sameViewProjection
})
