import type {
  CommitDelta
} from '#core/contracts/delta.ts'
import type {
  DataDoc
} from '#core/contracts/state.ts'
import {
  getDocumentActiveViewId
} from '#core/document/index.ts'

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
