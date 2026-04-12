import type {
  Field,
  FieldId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById
} from '@dataview/core/document'
import {
  createDerivedStore,
  read,
  type Equality,
  type ReadStore
} from '@shared/core'
import type {
  ActiveCell,
  ActiveReadApi,
  ActiveSelectApi,
  ActiveViewState,
  EngineReadApi
} from '../../api/public'
import type {
  AppearanceId,
  SectionKey
} from '../../project/readModels'
import type {
  CellRef,
  Placement
} from '../../project'

export const createActiveSelectApi = (
  state: ReadStore<ActiveViewState | undefined>
): ActiveSelectApi => (
  selector,
  isEqual
) => createDerivedStore({
  get: () => selector(read(state)),
  ...(isEqual ? { isEqual } : {})
})

export const createActiveReadApi = (input: {
  read: EngineReadApi
  state: ReadStore<ActiveViewState | undefined>
}): ActiveReadApi => {
  const readDocument = () => read(input.read.document)
  const readState = () => read(input.state)
  const readField = (fieldId: FieldId): Field | undefined => (
    getDocumentFieldById(readDocument(), fieldId)
  )
  const readSection = (key: SectionKey) => readState()?.sections.get(key)
  const readAppearance = (id: AppearanceId) => readState()?.appearances.get(id)
  const readCell = (cell: CellRef): ActiveCell | undefined => {
    const state = readState()
    if (!state) {
      return undefined
    }

    const appearance = state.appearances.get(cell.appearanceId)
    if (!appearance) {
      return undefined
    }

    const record = read(input.read.record, appearance.recordId)
    if (!record) {
      return undefined
    }

    return {
      appearanceId: cell.appearanceId,
      recordId: appearance.recordId,
      fieldId: cell.fieldId,
      sectionKey: appearance.sectionKey,
      record,
      field: readField(cell.fieldId),
      value: cell.fieldId === 'title'
        ? record.title
        : record.values[cell.fieldId]
    }
  }

  const planMove: ActiveReadApi['planMove'] = (
    appearanceIds,
    target
  ) => {
    const state = readState()
    if (!state) {
      return {
        appearanceIds: [],
        recordIds: [],
        changed: false,
        sectionChanged: false,
        target: {
          sectionKey: target.sectionKey
        }
      }
    }

    const validIds = appearanceIds.filter(id => state.appearances.has(id))
    const movingSet = new Set(validIds)
    const section = state.sections.get(target.sectionKey)
    const sectionAppearanceIds = section?.appearanceIds ?? []
    const beforeAppearanceId = target.before && sectionAppearanceIds.includes(target.before)
      ? target.before
      : undefined
    const remaining = sectionAppearanceIds.filter(id => !movingSet.has(id))
    const index = beforeAppearanceId
      ? remaining.indexOf(beforeAppearanceId)
      : -1
    const nextBeforeAppearanceId = beforeAppearanceId && index >= 0
      ? remaining[index]
      : undefined
    const recordIds = validIds.flatMap(id => {
      const recordId = state.appearances.get(id)?.recordId
      return recordId ? [recordId] : []
    }).filter((recordId, index, source) => source.indexOf(recordId) === index)
    const beforeRecordId = nextBeforeAppearanceId
      ? state.appearances.get(nextBeforeAppearanceId)?.recordId
      : undefined
    const sectionChanged = validIds.some(id => state.appearances.get(id)?.sectionKey !== target.sectionKey)
    const changed = (
      sectionChanged
      || validIds.some((id, index) => sectionAppearanceIds.filter(current => movingSet.has(current))[index] !== id)
      || Boolean(beforeAppearanceId !== nextBeforeAppearanceId)
    ) && validIds.length > 0

    return {
      appearanceIds: validIds,
      recordIds,
      changed,
      sectionChanged,
      target: {
        sectionKey: target.sectionKey,
        ...(nextBeforeAppearanceId ? { beforeAppearanceId: nextBeforeAppearanceId } : {}),
        ...(beforeRecordId ? { beforeRecordId } : {})
      }
    }
  }

  return {
    record: recordId => read(input.read.record, recordId),
    field: readField,
    section: readSection,
    appearance: readAppearance,
    cell: readCell,
    groupField: () => {
      const state = readState()
      if (!state || !state.query.group.active) {
        return undefined
      }

      return state.query.group.field
    },
    filterField: index => {
      const rule = readState()?.query.filter.rules[index]
      return rule?.field
        ?? (rule?.fieldId
          ? readField(rule.fieldId)
          : undefined)
    },
    planMove
  }
}
