import {
  sameOrder
} from '@shared/core'
import type {
  RecordId,
  View
} from '@dataview/core/contracts'
import type {
  SectionGroupIndex
} from '@dataview/engine/active/index/contracts'
import type {
  QueryState,
  SectionState
} from '@dataview/engine/contracts/internal'
import type {
  SectionKey
} from '@dataview/engine/contracts/public'
import {
  readQueryVisibleSet
} from '@dataview/engine/contracts/internal'

export const ROOT_SECTION_KEY = 'root' as SectionKey
export const ROOT_SECTION_KEYS = [ROOT_SECTION_KEY] as readonly SectionKey[]
export const ROOT_SECTION_ORDER = [ROOT_SECTION_KEY] as readonly SectionKey[]
const EMPTY_SECTION_KEYS = [] as readonly SectionKey[]

export interface SectionMembershipResolver {
  keysOf(recordId: RecordId): readonly SectionKey[]
  has(recordId: RecordId, sectionKey: SectionKey): boolean
}

export const sameSectionKeys = (
  left: readonly SectionKey[],
  right: readonly SectionKey[]
) => sameOrder(left, right)

export const createSectionMembershipResolver = (input: {
  query: QueryState
  view: View
  sectionGroup?: SectionGroupIndex
}): SectionMembershipResolver => {
  const visible = readQueryVisibleSet(input.query)

  if (!input.view.group) {
    return {
      keysOf: recordId => visible.has(recordId)
        ? ROOT_SECTION_KEYS
        : EMPTY_SECTION_KEYS,
      has: (recordId, sectionKey) => sectionKey === ROOT_SECTION_KEY && visible.has(recordId)
    }
  }

  return {
    keysOf: recordId => visible.has(recordId)
      ? input.sectionGroup?.recordSections.get(recordId) ?? EMPTY_SECTION_KEYS
      : EMPTY_SECTION_KEYS,
    has: (recordId, sectionKey) => visible.has(recordId)
      && (input.sectionGroup?.recordSections.get(recordId) ?? EMPTY_SECTION_KEYS).includes(sectionKey)
  }
}

export const createSectionMembershipResolverFromState = (
  state: SectionState,
  input: {
    recordIds?: ReadonlySet<RecordId> | 'all'
  } = {}
): SectionMembershipResolver => {
  const shouldBuildFullMap = input.recordIds === undefined
    || input.recordIds === 'all'
    || input.recordIds.size > 32
  let byRecord: ReadonlyMap<RecordId, readonly SectionKey[]> | undefined

  const ensureByRecord = () => {
    if (byRecord) {
      return byRecord
    }

    const next = new Map<RecordId, SectionKey[]>()
    state.order.forEach(sectionKey => {
      const section = state.byKey.get(sectionKey)
      if (!section) {
        return
      }

      section.recordIds.forEach(recordId => {
        const keys = next.get(recordId)
        if (keys) {
          keys.push(sectionKey)
          return
        }

        next.set(recordId, [sectionKey])
      })
    })
    byRecord = next
    return byRecord
  }

  const cache = new Map<RecordId, readonly SectionKey[]>()

  const readKeysForRecord = (
    recordId: RecordId
  ): readonly SectionKey[] => {
    const cached = cache.get(recordId)
    if (cached) {
      return cached
    }

    const keys: SectionKey[] = []
    state.order.forEach(sectionKey => {
      const section = state.byKey.get(sectionKey)
      if (section?.recordIds.includes(recordId)) {
        keys.push(sectionKey)
      }
    })
    cache.set(recordId, keys)
    return keys
  }

  return {
    keysOf: recordId => shouldBuildFullMap
      ? ensureByRecord().get(recordId) ?? EMPTY_SECTION_KEYS
      : readKeysForRecord(recordId),
    has: (recordId, sectionKey) => (
      shouldBuildFullMap
        ? ensureByRecord().get(recordId)?.includes(sectionKey) === true
        : readKeysForRecord(recordId).includes(sectionKey)
    )
  }
}

export const projectRecordIdsBySection = (input: {
  recordIds: readonly RecordId[]
  resolver: SectionMembershipResolver
}): ReadonlyMap<SectionKey, readonly RecordId[]> => {
  const projected = new Map<SectionKey, RecordId[]>()

  input.recordIds.forEach(recordId => {
    input.resolver.keysOf(recordId).forEach(sectionKey => {
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
