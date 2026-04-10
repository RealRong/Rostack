import type {
  RecordId,
  View
} from '@dataview/core/contracts'
import {
  readGroupFieldIndex
} from '../../../index/group'
import type {
  IndexState
} from '../../../index/types'
import type {
  SectionKey
} from '../../types'
import type {
  QueryState,
  SectionState
} from '../state'
import {
  ROOT_SECTION_KEY,
  buildSectionNode,
  sameRecordIds,
  sameSectionNode
} from './shape'

export const resolveSectionKeys = (input: {
  recordId: RecordId
  query: QueryState
  view: View
  index: IndexState
}): readonly SectionKey[] => {
  if (!input.query.visibleSet.has(input.recordId)) {
    return []
  }

  const group = input.view.group
  if (!group) {
    return [ROOT_SECTION_KEY]
  }

  return readGroupFieldIndex(input.index.group, group)?.recordBuckets.get(input.recordId) ?? []
}

export const buildSectionState = (input: {
  view: View
  query: QueryState
  index: IndexState
  previous?: SectionState
}): SectionState => {
  if (!input.view.group) {
    const root = {
      key: ROOT_SECTION_KEY,
      title: 'All',
      ids: input.query.visible,
      visible: true,
      collapsed: false
    }
    const previousRoot = input.previous?.byKey.get(ROOT_SECTION_KEY)

    return {
      order: [ROOT_SECTION_KEY],
      byKey: new Map([
        [ROOT_SECTION_KEY, previousRoot && sameSectionNode(previousRoot, root) ? previousRoot : root] as const
      ]),
      byRecord: new Map(
        input.query.visible.map(recordId => [recordId, [ROOT_SECTION_KEY]] as const)
      )
    }
  }

  const groupIndex = readGroupFieldIndex(input.index.group, input.view.group)
  const byRecord = new Map<RecordId, readonly SectionKey[]>()
  const idsByKey = new Map<SectionKey, RecordId[]>()

  input.query.visible.forEach(recordId => {
    const keys = groupIndex?.recordBuckets.get(recordId) ?? []
    byRecord.set(recordId, keys)
    keys.forEach(key => {
      const ids = idsByKey.get(key) ?? []
      if (!idsByKey.has(key)) {
        idsByKey.set(key, ids)
      }
      ids.push(recordId)
    })
  })

  const order = groupIndex?.order ?? []
  const byKey = new Map<SectionKey, ReturnType<typeof buildSectionNode>>()
  order.forEach(key => {
    const ids = idsByKey.get(key) ?? []
    const nextNode = buildSectionNode({
      key,
      ids,
      group: input.view.group,
      index: input.index
    })
    const previousNode = input.previous?.byKey.get(key)
    byKey.set(key, previousNode && sameSectionNode(previousNode, nextNode) ? previousNode : nextNode)
  })

  return {
    order: input.previous && sameRecordIds(input.previous.order, order)
      ? input.previous.order
      : order,
    byKey,
    byRecord
  }
}
