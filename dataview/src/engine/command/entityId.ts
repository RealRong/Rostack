import type { PropertyId, RecordId, ViewId } from '@dataview/core/contracts'

const seeds = {
  record: 0,
  field: 0,
  view: 0
}

const nextId = (prefix: keyof typeof seeds) => {
  seeds[prefix] += 1
  return `${prefix}_${Date.now().toString(36)}_${seeds[prefix]}`
}

export const createRecordId = (): RecordId => nextId('record')

export const createPropertyId = (): PropertyId => nextId('field')

export const createViewId = (): ViewId => nextId('view')
