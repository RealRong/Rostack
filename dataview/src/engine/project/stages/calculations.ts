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
  CalculationCollection
} from '@dataview/core/calculation'
import type {
  Appearance,
  AppearanceId,
  Section,
  SectionKey
} from './types'
import type {
  Stage
} from './stage'
import {
  reuse,
  shouldRun
} from './stage'

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

export const calculationsStage: Stage<ReadonlyMap<SectionKey, CalculationCollection>> = {
  run: input => {
    if (!shouldRun(input.action)) {
      return reuse(input)
    }

    const view = input.next.read.view()
    const sections = input.project.sections
    if (!view || !sections) {
      return undefined
    }

    const sectionProjection = input.next.read.sectionProjection()
    return createCalculationsBySection({
      view,
      fieldsById: input.next.read.fieldsById(),
      sections,
      appearances: sectionProjection.appearances,
      rowsById: input.next.read.rowsById()
    })
  }
}
