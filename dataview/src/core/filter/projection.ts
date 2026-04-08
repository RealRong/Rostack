import type {
  DataDoc,
  Field,
  FilterRule,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById,
  getDocumentViewById
} from '@dataview/core/document'
import {
  formatFilterRuleValueText,
  getFilterEditorKind,
  getFilterPresetIds,
  isFilterRuleEffective
} from './spec'
import type {
  FilterRuleProjection,
  ViewFilterProjection
} from './types'

export const resolveFilterRuleProjection = (
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

export const resolveViewFilterProjection = (
  document: DataDoc,
  viewId: ViewId
): ViewFilterProjection | undefined => {
  const view = getDocumentViewById(document, viewId)
  if (!view) {
    return undefined
  }

  return {
    viewId,
    mode: view.filter.mode,
    rules: view.filter.rules.map(rule => resolveFilterRuleProjection(
      getDocumentFieldById(document, rule.fieldId),
      rule
    ))
  }
}
