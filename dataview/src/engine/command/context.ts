import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  RecordId,
  Row,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentActiveViewId,
  getDocumentCustomFieldById,
  getDocumentCustomFields,
  getDocumentRecordById,
  getDocumentRecords,
  getDocumentViewById,
  getDocumentViews
} from '@dataview/core/document'

export interface CommandRead {
  records: {
    list: () => readonly Row[]
    get: (recordId: RecordId) => Row | undefined
    has: (recordId: RecordId) => boolean
  }
  fields: {
    list: () => readonly CustomField[]
    get: (fieldId: CustomFieldId) => CustomField | undefined
    has: (fieldId: CustomFieldId) => boolean
  }
  views: {
    list: () => readonly View[]
    get: (viewId: ViewId) => View | undefined
    has: (viewId: ViewId) => boolean
    activeId: () => ViewId | undefined
    active: () => View | undefined
  }
}

export interface CommandContext {
  index: number
  doc: DataDoc
  read: CommandRead
}

export const createCommandRead = (document: DataDoc): CommandRead => ({
  records: {
    list: () => getDocumentRecords(document),
    get: recordId => getDocumentRecordById(document, recordId),
    has: recordId => Boolean(getDocumentRecordById(document, recordId))
  },
  fields: {
    list: () => getDocumentCustomFields(document),
    get: fieldId => getDocumentCustomFieldById(document, fieldId),
    has: fieldId => Boolean(getDocumentCustomFieldById(document, fieldId))
  },
  views: {
    list: () => getDocumentViews(document),
    get: viewId => getDocumentViewById(document, viewId),
    has: viewId => Boolean(getDocumentViewById(document, viewId)),
    activeId: () => getDocumentActiveViewId(document),
    active: () => {
      const viewId = getDocumentActiveViewId(document)
      return viewId
        ? getDocumentViewById(document, viewId)
        : undefined
    }
  }
})

export const createCommandContext = (input: {
  index: number
  doc: DataDoc
}): CommandContext => ({
  index: input.index,
  doc: input.doc,
  read: createCommandRead(input.doc)
})
