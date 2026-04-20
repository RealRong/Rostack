import {
  sameOrder
} from '@shared/core'
import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  SectionKey
} from '@dataview/engine/contracts/public'

export const ROOT_SECTION_KEY = 'root' as SectionKey
export const ROOT_SECTION_KEYS = [ROOT_SECTION_KEY] as readonly SectionKey[]
export const ROOT_SECTION_ORDER = [ROOT_SECTION_KEY] as readonly SectionKey[]
export const EMPTY_SECTION_KEYS = [] as readonly SectionKey[]

export const sameSectionKeys = (
  left: readonly SectionKey[],
  right: readonly SectionKey[]
) => sameOrder(left, right)

export const buildSectionKeysByRecord = (input: {
  recordIds: readonly RecordId[]
  keysOf: (recordId: RecordId) => readonly SectionKey[]
}): ReadonlyMap<RecordId, readonly SectionKey[]> => {
  const next = new Map<RecordId, readonly SectionKey[]>()
  input.recordIds.forEach(recordId => {
    const keys = input.keysOf(recordId)
    if (keys.length) {
      next.set(recordId, keys)
    }
  })
  return next
}

export const projectRecordIdsBySection = (input: {
  recordIds: readonly RecordId[]
  keysByRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
}): ReadonlyMap<SectionKey, readonly RecordId[]> => {
  const projected = new Map<SectionKey, RecordId[]>()

  input.recordIds.forEach(recordId => {
    input.keysByRecord.get(recordId)?.forEach(sectionKey => {
      const ids = projected.get(sectionKey)
      if (ids) {
        ids.push(recordId)
        return
      }

      projected.set(sectionKey, [recordId])
    })
  })

  return projected
}
