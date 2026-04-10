import type { BaseOperation } from '@dataview/core/contracts/operations'
import type {
  DataDoc,
  CustomField,
  View,
  CustomFieldId
} from '@dataview/core/contracts/state'
import {
  getDocumentViews
} from '@dataview/core/document'
import {
  getFieldGroupMeta
} from '@dataview/core/field'
import {
  repairViewForConvertedField,
  repairViewForRemovedField
} from '@dataview/core/view'

const buildViewPutOperation = (view: View): BaseOperation => ({
  type: 'document.view.put',
  view
})

export const resolvePropertyCreateViewOperations = (
  document: DataDoc,
  field: CustomField
): BaseOperation[] => {
  return getDocumentViews(document)
    .filter(view => view.type === 'table')
    .flatMap(view => {
      if (view.display.fields.includes(field.id)) {
        return []
      }

      return [buildViewPutOperation({
        ...view,
        display: {
          fields: [...view.display.fields, field.id]
        }
      })]
    })
}

export const resolvePropertyRemoveViewOperations = (
  document: DataDoc,
  fieldId: CustomFieldId
): BaseOperation[] => (
  getDocumentViews(document)
    .flatMap(view => {
      const nextView = repairViewForRemovedField(view, fieldId)
      return nextView === view ? [] : [buildViewPutOperation(nextView)]
    })
)

export const resolvePropertyConvertViewOperations = (
  document: DataDoc,
  field: CustomField
): BaseOperation[] => (
  getDocumentViews(document)
    .flatMap(view => {
      const nextView = repairViewForConvertedField(view, field)
      return nextView === view ? [] : [buildViewPutOperation(nextView)]
    })
)
