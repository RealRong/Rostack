import { equal } from '@shared/core'
import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  SectionKey
} from '@dataview/engine/contracts'

export const ROOT_SECTION_KEY = 'root' as SectionKey
export const ROOT_SECTION_KEYS = [ROOT_SECTION_KEY] as readonly SectionKey[]
export const ROOT_SECTION_ORDER = [ROOT_SECTION_KEY] as readonly SectionKey[]
export const EMPTY_SECTION_KEYS = [] as readonly SectionKey[]

export const sameSectionKeys = (
  left: readonly SectionKey[],
  right: readonly SectionKey[]
) => equal.sameOrder(left, right)

export const buildSectionMembership = (input: {
  recordIds: readonly RecordId[]
  keysByRecord?: ReadonlyMap<RecordId, readonly SectionKey[]>
  order?: ReadonlyMap<RecordId, number>
  fullOrder?: boolean
}): {
  keysByRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
  recordIdsBySection: ReadonlyMap<SectionKey, readonly RecordId[]>
  recordIndexesBySection: ReadonlyMap<SectionKey, readonly number[]>
} => {
  const nextKeysByRecord = new Map<RecordId, readonly SectionKey[]>()
  const nextRecordIdsBySection = new Map<SectionKey, RecordId[]>()
  const nextRecordIndexesBySection = new Map<SectionKey, number[]>()

  for (let index = 0; index < input.recordIds.length; index += 1) {
    const recordId = input.recordIds[index]!
    const keys = input.keysByRecord?.get(recordId)
    if (!keys?.length) {
      continue
    }

    const recordIndex = input.fullOrder
      ? index
      : input.order?.get(recordId)
    nextKeysByRecord.set(recordId, keys)
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      const sectionKey = keys[keyIndex]!
      const ids = nextRecordIdsBySection.get(sectionKey)
      if (ids) {
        ids.push(recordId)
      } else {
        nextRecordIdsBySection.set(sectionKey, [recordId])
      }

      if (recordIndex === undefined) {
        continue
      }

      const indexes = nextRecordIndexesBySection.get(sectionKey)
      if (indexes) {
        indexes.push(recordIndex)
        continue
      }

      nextRecordIndexesBySection.set(sectionKey, [recordIndex])
    }
  }

  return {
    keysByRecord: nextKeysByRecord,
    recordIdsBySection: nextRecordIdsBySection,
    recordIndexesBySection: nextRecordIndexesBySection
  }
}

export const projectSectionMembers = (input: {
  recordIds: readonly RecordId[]
  keysByRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
  order?: ReadonlyMap<RecordId, number>
  fullOrder?: boolean
}): {
  recordIdsBySection: ReadonlyMap<SectionKey, readonly RecordId[]>
  recordIndexesBySection: ReadonlyMap<SectionKey, readonly number[]>
} => {
  const recordIdsBySection = new Map<SectionKey, RecordId[]>()
  const recordIndexesBySection = new Map<SectionKey, number[]>()

  for (let index = 0; index < input.recordIds.length; index += 1) {
    const recordId = input.recordIds[index]!
    const sectionKeys = input.keysByRecord.get(recordId)
    if (!sectionKeys?.length) {
      continue
    }

    const recordIndex = input.fullOrder
      ? index
      : input.order?.get(recordId)
    for (let keyIndex = 0; keyIndex < sectionKeys.length; keyIndex += 1) {
      const sectionKey = sectionKeys[keyIndex]!
      const ids = recordIdsBySection.get(sectionKey)
      if (ids) {
        ids.push(recordId)
      } else {
        recordIdsBySection.set(sectionKey, [recordId])
      }

      if (recordIndex === undefined) {
        continue
      }

      const indexes = recordIndexesBySection.get(sectionKey)
      if (indexes) {
        indexes.push(recordIndex)
        continue
      }

      recordIndexesBySection.set(sectionKey, [recordIndex])
    }
  }

  return {
    recordIdsBySection,
    recordIndexesBySection
  }
}
