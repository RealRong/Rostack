import type {
  Field,
  FilterRule
} from '@dataview/core/contracts'
import type {
  FilterRuleProjection,
  ViewFilterProjection
} from '@dataview/core/filter'
import {
  formatFilterRuleValueText,
  getFilterEditorKind,
  getFilterPresetIds,
  isFilterRuleEffective
} from '@dataview/core/filter'
import type {
  FilterView
} from '../../types'
import type {
  Stage
} from '../runtime/stage'
import {
  reuse,
  shouldRun
} from '../runtime/stage'

const createFilterRuleProjection = (
  field: Field | undefined,
  rule: FilterRule
): FilterRuleProjection => {
  const editorKind = getFilterEditorKind(field, rule)

  return {
    rule,
    fieldId: rule.fieldId,
    field,
    fieldLabel: field?.name ?? 'Deleted field',
    activePresetId: rule.presetId,
    effective: isFilterRuleEffective(field, rule),
    editorKind,
    valueText: formatFilterRuleValueText(field, rule),
    bodyLayout: editorKind === 'none'
      ? 'none'
      : editorKind === 'option-set'
        ? 'flush'
        : 'inset',
    conditions: getFilterPresetIds(field).map(id => ({
      id,
      selected: id === rule.presetId
    }))
  }
}

const createFilterProjection = (input: {
  viewId: string
  rules: readonly FilterRule[]
  fieldsById: ReadonlyMap<string, Field>
  titleField: Field | undefined
  mode: ViewFilterProjection['mode']
}): ViewFilterProjection => ({
  viewId: input.viewId,
  mode: input.mode,
  rules: input.rules.map(rule => createFilterRuleProjection(
    rule.fieldId === 'title'
      ? input.titleField
      : input.fieldsById.get(rule.fieldId),
    rule
  ))
})

export const filterStage: Stage<FilterView> = {
  run: input => {
    if (!shouldRun(input.action)) {
      return reuse(input)
    }

    const view = input.next.read.view()
    const titleField = input.next.read.fieldsById().get('title')

    return view && input.next.activeViewId
      ? createFilterProjection({
          viewId: input.next.activeViewId,
          rules: view.filter.rules,
          fieldsById: input.next.read.fieldsById(),
          titleField,
          mode: view.filter.mode
        })
      : undefined
  }
}
