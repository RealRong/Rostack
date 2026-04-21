import type {
  FieldReducerState,
} from '@dataview/core/calculation'
import {
  FieldId
} from '@dataview/core/contracts'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import type {
  CalculationTransition
} from '@dataview/engine/active/shared/transition'
import {
  reduce
} from '@dataview/engine/active/shared/reduce'
import type {
  SectionKey
} from '@dataview/engine/contracts'
import type {
  MembershipDelta,
  MembershipState,
  SummaryDelta,
  SummaryState
} from '@dataview/engine/contracts/state'
import {
  buildEmptySummaryState
} from '@dataview/engine/summary/empty'

const EMPTY_FIELD_SUMMARIES = new Map<FieldId, FieldReducerState>()
const EMPTY_MEMBERSHIP_DELTA: MembershipDelta = {
  rebuild: false,
  orderChanged: false,
  changed: [],
  removed: [],
  records: new Map()
}
const EMPTY_SUMMARY_DELTA: SummaryDelta = {
  rebuild: false,
  changed: [],
  removed: []
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

const collectSectionKeys = (
  membership: MembershipState
): readonly SectionKey[] => membership.sections.order.filter(
  sectionKey => membership.sections.get(sectionKey) !== undefined
)

const buildSectionSummaryFields = (input: {
  sectionKey: SectionKey
  membership: MembershipState
  calcFields: readonly FieldId[]
  index: IndexState
}): ReadonlyMap<FieldId, FieldReducerState> => {
  const selection = input.membership.sections.get(input.sectionKey)
  if (!selection) {
    return EMPTY_FIELD_SUMMARIES
  }

  const byField = new Map<FieldId, FieldReducerState>()

  input.calcFields.forEach(fieldId => {
    const fieldIndex = input.index.calculations.fields.get(fieldId)
    if (!fieldIndex) {
      return
    }

    byField.set(fieldId, reduce.summary({
      selection,
      column: input.index.rows.column.calc(fieldId),
      capabilities: fieldIndex.capabilities
    }))
  })

  return byField.size
    ? byField
    : EMPTY_FIELD_SUMMARIES
}

const buildSummaryState = (input: {
  membership: MembershipState
  calcFields: readonly FieldId[]
  index: IndexState
}): SummaryState => {
  const sectionKeys = collectSectionKeys(input.membership)
  if (!input.calcFields.length) {
    return buildEmptySummaryState(sectionKeys) as SummaryState
  }

  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, FieldReducerState>>()
  sectionKeys.forEach(sectionKey => {
    bySection.set(sectionKey, buildSectionSummaryFields({
      sectionKey,
      membership: input.membership,
      calcFields: input.calcFields,
      index: input.index
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
    return EMPTY_SUMMARY_DELTA
  }

  return {
    rebuild: false,
    changed,
    removed: input.removed
  }
}

const collectTouchedSections = (input: {
  previousMembership: MembershipState
  membership: MembershipState
  membershipDelta: MembershipDelta
  calcFields: readonly FieldId[]
  calculationDelta?: CalculationTransition
}): ReadonlySet<SectionKey> | 'all' => {
  const touched = new Set<SectionKey>(input.membershipDelta.changed)
  input.membershipDelta.changed.forEach(sectionKey => {
    const previousSelection = input.previousMembership.sections.get(sectionKey)
    const nextSelection = input.membership.sections.get(sectionKey)
    if (
      previousSelection
      && nextSelection
      && sameRecordSet(previousSelection.read.ids(), nextSelection.read.ids())
    ) {
      touched.delete(sectionKey)
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
  action: 'reuse' | 'sync' | 'rebuild'
}): {
  state: SummaryState
  delta: SummaryDelta
} => {
  const previousState = input.previous
  const membershipDelta = input.membershipDelta ?? EMPTY_MEMBERSHIP_DELTA
  const sectionKeys = collectSectionKeys(input.membership)

  if (input.action === 'reuse' && previousState) {
    return {
      state: previousState,
      delta: EMPTY_SUMMARY_DELTA
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
        calcFields: input.calcFields,
        index: input.index
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
  const touched = collectTouchedSections({
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
          sectionKey,
          membership: input.membership,
          calcFields: input.calcFields,
          index: input.index
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
