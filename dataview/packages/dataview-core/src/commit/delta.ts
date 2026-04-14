import type {
  CommitDelta
} from '@dataview/core/contracts/delta'
import type {
  DataDoc
} from '@dataview/core/contracts/state'
import {
  getDocumentActiveViewId
} from '@dataview/core/document'

export const createResetDelta = (
  beforeDocument: DataDoc | undefined,
  afterDocument: DataDoc
): CommitDelta => ({
  summary: {
    records: true,
    fields: true,
    views: true,
    values: true,
    activeView: getDocumentActiveViewId(beforeDocument ?? afterDocument) !== getDocumentActiveViewId(afterDocument),
    indexes: true
  },
  entities: {
    records: {
      update: 'all'
    },
    fields: {
      update: 'all'
    },
    views: {
      update: 'all'
    },
    values: {
      records: 'all',
      fields: 'all'
    }
  },
  semantics: [{
    kind: 'activeView.set',
    before: beforeDocument
      ? getDocumentActiveViewId(beforeDocument)
      : undefined,
    after: getDocumentActiveViewId(afterDocument)
  }]
})
