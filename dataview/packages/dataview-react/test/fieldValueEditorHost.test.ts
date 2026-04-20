import { describe, expect, test } from 'vitest'
import {
  document as documentApi
} from '@dataview/core/document'
import {
  resolveFieldValueEditorField
} from '@dataview/react/page/hosts/FieldValueEditorHost'

describe('resolveFieldValueEditorField', () => {
  test('resolves the synthetic title field even though it is not stored in doc.fields', () => {
    expect(resolveFieldValueEditorField({
      fieldId: 'title',
      customField: undefined
    })).toEqual(documentApi.fields.title.get())
  })

  test('keeps using document-backed custom fields for non-title editors', () => {
    const customField = {
      id: 'status',
      name: 'Status',
      kind: 'status',
      system: false,
      options: []
    } as const

    expect(resolveFieldValueEditorField({
      fieldId: customField.id,
      customField
    })).toBe(customField)
  })
})
