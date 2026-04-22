import type {
  CalculationEntry,
  FieldReducerState,
  ReducerCapabilitySet
} from '@dataview/core/calculation'
import {
  FieldId
} from '@dataview/core/contracts'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import type {
  ReadColumn
} from '@dataview/engine/active/shared/rows'
import type {
  Selection
} from '@dataview/engine/active/shared/selection'
import type {
  CalculationTransition
} from '@dataview/engine/active/shared/transition'
import {
  reduce
} from '@dataview/engine/active/shared/reduce'
import type {
  SectionKey
} from '@dataview/engine/contracts/shared'
import type {
  MembershipPhaseDelta as MembershipDelta,
  MembershipPhaseState as MembershipState,
  SummaryPhaseDelta as SummaryDelta,
  SummaryPhaseState as SummaryState
} from '@dataview/engine/active/state'
import {
  EMPTY_MEMBERSHIP_PHASE_DELTA,
  EMPTY_SUMMARY_PHASE_DELTA
} from '@dataview/engine/active/state'
import {
  buildEmptySummaryState
} from '@dataview/engine/active/summary/empty'

const EMPTY_FIELD_SUMMARIES = new Map<FieldId, FieldReducerState>()

interface SummaryFieldRuntime {
  fieldId: FieldId
  column: ReadColumn<CalculationEntry> | undefined
  capabilities: ReducerCapabilitySet
}

const sameRecordSet = (
  left: readonly string[],
  right: readonly string[]
) => {
  if (left === right || left.length === right.length && left.every((value, index) => value === right[index])) {
    return true
  }

  if (left.length !== right.length) {
    return false
  }

  const leftSet = new Set(left)
  for (let index = 0; index < right.length; index += 1) {
    if (!leftSet.has(right[index]!)) {
      return false
    }
  }

  return true
}

const sameSelectionRecordSet = (
  previous: Selection | undefined,
  next: Selection | undefined
): boolean => Boolean(
  previous
  && next
  && sameRecordSet(previous.ids, next.ids)
)

const collectSectionKeys = (
  membership: MembershipState
): readonly SectionKey[] => membership.sections.order.filter(
  sectionKey => membership.sections.get(sectionKey) !== undefined
)

const prepareSummaryFields = (input: {
  calcFields: readonly FieldId[]
  index: IndexState
}): readonly SummaryFieldRuntime[] => {
  const fields: SummaryFieldRuntime[] = []

  for (let index = 0; index < input.calcFields.length; index += 1) {
    const fieldId = input.calcFields[index]!
    const fieldIndex = input.index.calculations.fields.get(fieldId)
    if (!fieldIndex) {
      continue
    }

    fields.push({
      fieldId,
      column: input.index.rows.column.calc(fieldId),
      capabilities: fieldIndex.capabilities
    })
  }

  return fields
}

const buildSectionSummaryFields = (input: {
  selection?: Selection
  fields: readonly SummaryFieldRuntime[]
}): ReadonlyMap<FieldId, FieldReducerState> => {
  if (!input.selection) {
    return EMPTY_FIELD_SUMMARIES
  }

  const byField = new Map<FieldId, FieldReducerState>()

  for (let index = 0; index < input.fields.length; index += 1) {
    const field = input.fields[index]!
    byField.set(field.fieldId, reduce.summary({
      selection: input.selection,
      column: field.column,
      capabilities: field.capabilities
    }))
  }

  return byField.size
    ? byField
    : EMPTY_FIELD_SUMMARIES
}

const buildSummaryState = (input: {
  membership: MembershipState
  fields: readonly SummaryFieldRuntime[]
}): SummaryState => {
  const sectionKeys = collectSectionKeys(input.membership)
  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, FieldReducerState>>()

  sectionKeys.forEach(sectionKey => {
    bySection.set(sectionKey, buildSectionSummaryFields({
      selection: input.membership.sections.get(sectionKey),
      fields: input.fields
    }))
  })

  return {
    bySection
  }
}

const collectRemovedSections = (input: {
  previous: SummaryState
  membership: MembershipState
}): readonly SectionKey[] => {
  const removed: SectionKey[] = []

  input.previous.bySection.forEach((_value, sectionKey) => {
    if (!input.membership.sections.get(sectionKey)) {
      removed.push(sectionKey)
    }
  })

  return removed
}

const createSummaryDelta = (input: {
  rebuild: boolean
  changed: ReadonlySet<SectionKey> | readonly SectionKey[]
  removed: readonly SectionKey[]
}): SummaryDelta => {
  if (input.rebuild) {
    return {
      rebuild: true,
      changed: Array.isArray(input.changed)
        ? input.changed
        : [...input.changed],
      removed: input.removed
    }
  }

  const changed = Array.isArray(input.changed)
    ? input.changed
    : [...input.changed]
  if (!changed.length && !input.removed.length) {
    return EMPTY_SUMMARY_PHASE_DELTA
  }

  return {
    rebuild: false,
    changed,
    removed: input.removed
  }
}

export const resolveSummaryTouchedSections = (input: {
  previousMembership: MembershipState
  membership: MembershipState
  membershipDelta: MembershipDelta
  calcFields: readonly FieldId[]
  calculationDelta?: CalculationTransition
}): ReadonlySet<SectionKey> | 'all' => {
  const touched = new Set<SectionKey>()

  input.membershipDelta.changed.forEach(sectionKey => {
    if (!sameSelectionRecordSet(
      input.previousMembership.sections.get(sectionKey),
      input.membership.sections.get(sectionKey)
    )) {
      touched.add(sectionKey)
    }
  })

  input.membershipDelta.records.forEach(({ before, after }) => {
    before.forEach(sectionKey => {
      touched.add(sectionKey)
    })
    after.forEach(sectionKey => {
      touched.add(sectionKey)
    })
  })

  for (let index = 0; index < input.calcFields.length; index += 1) {
    const fieldId = input.calcFields[index]!
    const fieldChange = input.calculationDelta?.fields.get(fieldId)
    if (!fieldChange) {
      continue
    }

    if (fieldChange.rebuild) {
      return 'all'
    }

    fieldChange.records.forEach((_change, recordId) => {
      const previousKeys = input.previousMembership.sections.keys(recordId)
      const nextKeys = input.membership.sections.keys(recordId)
      previousKeys.forEach(sectionKey => {
        touched.add(sectionKey)
      })
      nextKeys.forEach(sectionKey => {
        touched.add(sectionKey)
      })
    })
  }

  return touched
}

export const deriveSummaryState = (input: {
  previous?: SummaryState
  previousMembership?: MembershipState
  membership: MembershipState
  membershipDelta?: MembershipDelta
  calcFields: readonly FieldId[]
  index: IndexState
  calculationDelta?: CalculationTransition
  touchedSections?: ReadonlySet<SectionKey> | 'all'
  action: 'reuse' | 'sync' | 'rebuild'
}): {
  state: SummaryState
  delta: SummaryDelta
} => {
  const previousState = input.previous
  const membershipDelta = input.membershipDelta ?? EMPTY_MEMBERSHIP_PHASE_DELTA
  const sectionKeys = collectSectionKeys(input.membership)
  const fields = prepareSummaryFields({
    calcFields: input.calcFields,
    index: input.index
  })

  if (input.action === 'reuse' && previousState) {
    return {
      state: previousState,
      delta: EMPTY_SUMMARY_PHASE_DELTA
    }
  }

  if (!input.calcFields.length) {
    const state = buildEmptySummaryState(sectionKeys, previousState) as SummaryState
    if (
      !previousState
      || !input.previousMembership
      || input.action === 'rebuild'
    ) {
      return {
        state,
        delta: createSummaryDelta({
          rebuild: true,
          changed: sectionKeys,
          removed: []
        })
      }
    }

    const removed = collectRemovedSections({
      previous: previousState,
      membership: input.membership
    })
    const changed = membershipDelta.orderChanged
      ? sectionKeys
      : sectionKeys.filter(sectionKey => !previousState.bySection.has(sectionKey))

    return {
      state,
      delta: createSummaryDelta({
        rebuild: false,
        changed,
        removed
      })
    }
  }

  if (
    !previousState
    || !input.previousMembership
    || input.action === 'rebuild'
  ) {
    return {
      state: buildSummaryState({
        membership: input.membership,
        fields
      }),
      delta: createSummaryDelta({
        rebuild: true,
        changed: sectionKeys,
        removed: []
      })
    }
  }

  const removed = collectRemovedSections({
    previous: previousState,
    membership: input.membership
  })
  const touched = input.touchedSections ?? resolveSummaryTouchedSections({
    previousMembership: input.previousMembership,
    membership: input.membership,
    membershipDelta,
    calcFields: input.calcFields,
    calculationDelta: input.calculationDelta
  })
  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, FieldReducerState>>()
  const changed = new Set<SectionKey>()
  let stateChanged = membershipDelta.orderChanged || removed.length > 0

  sectionKeys.forEach(sectionKey => {
    const previousByField = previousState.bySection.get(sectionKey)
    const nextByField = (
      touched === 'all'
      || touched.has(sectionKey)
      || !previousByField
    )
      ? buildSectionSummaryFields({
          selection: input.membership.sections.get(sectionKey),
          fields
        })
      : previousByField

    bySection.set(sectionKey, nextByField)
    if (nextByField !== previousByField) {
      changed.add(sectionKey)
      stateChanged = true
    }
  })

  return {
    state: stateChanged
      ? {
          bySection
        }
      : previousState,
    delta: createSummaryDelta({
      rebuild: false,
      changed,
      removed
    })
  }
}
