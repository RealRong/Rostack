import type {
  Intent as CoreIntent,
  RecordId
} from '@dataview/core/types'
import { createId } from '@shared/core'
import type {
  ItemId,
  SectionId
} from '@dataview/engine/contracts/shared'
import type {
  ActiveRecordsApi,
  ViewState
} from '@dataview/engine/contracts/view'
import type {
  ActiveViewContext
} from '@dataview/engine/active/api/context'
import {
  buildRecordCreateIntents
} from '@dataview/engine/active/api/recordCreate'

const createMoveOrderAction = (
  base: ActiveViewContext,
  recordIds: readonly RecordId[],
  beforeRecordId?: RecordId
): Extract<CoreIntent, { type: 'view.order.move' | 'view.order.splice' }> | undefined => {
  const view = base.view()
  const viewId = base.query().views.activeId()
  if (!view || !viewId || !recordIds.length) {
    return undefined
  }

  return recordIds.length === 1
    ? {
        type: 'view.order.move',
        id: viewId,
        record: recordIds[0]!,
        ...(beforeRecordId !== undefined
          ? { before: beforeRecordId }
          : {})
      }
    : {
        type: 'view.order.splice',
        id: viewId,
        records: [...recordIds],
        ...(beforeRecordId !== undefined
          ? { before: beforeRecordId }
          : {})
      }
}

const resolveCreateContext = (input: {
  state: ViewState
  section?: SectionId
  before?: ItemId
}) => {
  const beforePlacement = input.before === undefined
    ? undefined
    : input.state.items.read.placement(input.before)
  if (input.before !== undefined && !beforePlacement) {
    return undefined
  }

  const nextSectionId = input.section
    ?? beforePlacement?.sectionId
    ?? (!input.state.view.group
      ? input.state.sections.ids[0]
      : undefined)
  if (!nextSectionId) {
    return undefined
  }

  if (beforePlacement && beforePlacement.sectionId !== nextSectionId) {
    return undefined
  }

  const section = input.state.sections.get(nextSectionId)
  if (!section) {
    return undefined
  }

  if (beforePlacement && !section.itemIds.includes(input.before!)) {
    return undefined
  }

  return {
    section: nextSectionId,
    beforeRecord: beforePlacement?.recordId,
    bucketId: section.bucket?.id
  }
}

export const createActiveRecordsApi = (input: {
  base: ActiveViewContext
}): ActiveRecordsApi => ({
  create: createInput => {
    const state = input.base.state()
    if (!state) {
      return undefined
    }

    const context = resolveCreateContext({
      state,
      section: createInput?.section,
      before: createInput?.before
    })
    if (!context) {
      return undefined
    }

    const recordId: RecordId = createId('record')
    const created = buildRecordCreateIntents({
      recordId,
      values: createInput?.values,
      hasField: fieldId => input.base.query().fields.has(fieldId),
      filter: {
        mode: state.view.filter.mode,
        rules: state.query.filters.rules.map(rule => ({
          fieldId: rule.rule.fieldId,
          field: rule.field,
          rule: rule.rule,
          effective: rule.effective
        }))
      },
      group: {
        view: state.view.group,
        field: state.query.group?.field,
        bucketId: context.bucketId
      }
    })
    if (!created) {
      return undefined
    }
    const actions: CoreIntent[] = [...created]

    if (!state.view.sort.rules.length && context.beforeRecord) {
      const moveAction = createMoveOrderAction(
        input.base,
        [recordId],
        context.beforeRecord
      )
      if (moveAction) {
        actions.push(moveAction)
      }
    }

    const result = input.base.execute(actions)
    return result.ok
      ? recordId
      : undefined
  }
})
