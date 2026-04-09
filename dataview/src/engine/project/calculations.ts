import type {
  Field,
  FieldId,
  RecordId,
  Row,
  View
} from '@dataview/core/contracts'
import {
  computeCalculationsForFields
} from '@dataview/core/calculation'
import type {
  Appearance,
  AppearanceId,
  Section
} from './types'

export const createCalculationsBySection = (input: {
  view: View
  fieldsById: ReadonlyMap<FieldId, Field>
  sections: readonly Section[]
  appearances: ReadonlyMap<AppearanceId, Appearance>
  rowsById: ReadonlyMap<RecordId, Row>
}) => new Map(
  input.sections.map(section => {
    const rows = section.ids
      .map(appearanceId => input.appearances.get(appearanceId)?.recordId)
      .map(recordId => (recordId ? input.rowsById.get(recordId) : undefined))
      .filter((row): row is Row => Boolean(row))

    return [section.key, computeCalculationsForFields({
      calculations: input.view.calc,
      fields: input.fieldsById,
      rows
    })] as const
  })
)
