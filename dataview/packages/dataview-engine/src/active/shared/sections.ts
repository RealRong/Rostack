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

export const buildSectionMembership = (input: {
  recordIds: readonly RecordId[]
  keysByRecord?: ReadonlyMap<RecordId, readonly SectionKey[]>
}): {
  keysByRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
  recordIdsBySection: ReadonlyMap<SectionKey, readonly RecordId[]>
} => {
  const nextKeysByRecord = new Map<RecordId, readonly SectionKey[]>()
  const nextRecordIdsBySection = new Map<SectionKey, RecordId[]>()

  for (let index = 0; index < input.recordIds.length; index += 1) {
    const recordId = input.recordIds[index]!
    const keys = input.keysByRecord?.get(recordId)
    if (!keys?.length) {
      continue
    }

    nextKeysByRecord.set(recordId, keys)
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      const sectionKey = keys[keyIndex]!
      const ids = nextRecordIdsBySection.get(sectionKey)
      if (ids) {
        ids.push(recordId)
        continue
      }

      nextRecordIdsBySection.set(sectionKey, [recordId])
    }
  }

  return {
    keysByRecord: nextKeysByRecord,
    recordIdsBySection: nextRecordIdsBySection
  }
}

export const projectRecordIdsBySection = (input: {
  recordIds: readonly RecordId[]
  keysByRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
}): ReadonlyMap<SectionKey, readonly RecordId[]> => {
  const projected = new Map<SectionKey, RecordId[]>()

  for (let index = 0; index < input.recordIds.length; index += 1) {
    const recordId = input.recordIds[index]!
    const sectionKeys = input.keysByRecord.get(recordId)
    if (!sectionKeys?.length) {
      continue
    }

    for (let keyIndex = 0; keyIndex < sectionKeys.length; keyIndex += 1) {
      const sectionKey = sectionKeys[keyIndex]!
      const ids = projected.get(sectionKey)
      if (ids) {
        ids.push(recordId)
        continue
      }

      projected.set(sectionKey, [recordId])
    }
  }

  return projected
}
