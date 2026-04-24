import {
  meta as mutationMeta
} from '@shared/mutation'
import type {
  DocumentOperation
} from '@dataview/core/contracts/operations'

export const META = mutationMeta.family<DocumentOperation>({
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
})
