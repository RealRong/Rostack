import { meta as mutationMeta } from '@shared/mutation'
import type {
  DocumentOperation,
  OperationType
} from '@dataview/core/contracts/operations'

export type DocumentOperationFamily =
  | 'record'
  | 'field'
  | 'view'
  | 'external'

export type DocumentOperationMeta = {
  family: DocumentOperationFamily
  history?: boolean
}

export type DocumentOperationMetaTable = Record<OperationType, DocumentOperationMeta>

const TABLE = {
  'document.record.insert': {
    family: 'record'
  },
  'document.record.patch': {
    family: 'record'
  },
  'document.record.remove': {
    family: 'record'
  },
  'document.record.fields.writeMany': {
    family: 'record'
  },
  'document.record.fields.restoreMany': {
    family: 'record'
  },
  'document.view.put': {
    family: 'view'
  },
  'document.activeView.set': {
    family: 'view'
  },
  'document.view.remove': {
    family: 'view'
  },
  'document.field.put': {
    family: 'field'
  },
  'document.field.patch': {
    family: 'field'
  },
  'document.field.remove': {
    family: 'field'
  },
  'external.version.bump': {
    family: 'external',
    history: false
  }
} satisfies DocumentOperationMetaTable

export const META = mutationMeta.create<DocumentOperation>(TABLE)
