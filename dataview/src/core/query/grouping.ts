import type {
  GroupDocument,
  GroupGroupBy,
  GroupRecord,
  RecordId
} from '../contracts'
import { getDocumentPropertyById } from '../document'
import {
  compareGroupBuckets,
  resolveGroupBucketDomain,
  resolveGroupBucketEntries,
  type GroupBucket
} from '../property'
import { getRecordPropertyValue } from './semantics'

export interface ResolvedGroup extends GroupBucket {
  records: RecordId[]
}

interface ObservedGroup {
  descriptor: GroupBucket
  records: RecordId[]
}

export const resolveGroupedRecords = (
  document: GroupDocument,
  records: readonly GroupRecord[],
  group: GroupGroupBy | undefined
): ResolvedGroup[] => {
  if (!group) {
    return []
  }

  const property = getDocumentPropertyById(document, group.property)
  if (!property) {
    return []
  }
  const observed = new Map<string, ObservedGroup>()

  records.forEach(record => {
    resolveGroupBucketEntries(
      property,
      getRecordPropertyValue(record, group.property),
      group
    ).forEach(entry => {
      const current = observed.get(entry.key)
      if (current) {
        current.records.push(record.id)
        return
      }

      observed.set(entry.key, {
        descriptor: {
          ...entry
        },
        records: [record.id]
      })
    })
  })

  const resolved = new Map<string, ObservedGroup>()

  resolveGroupBucketDomain(property, group).forEach(descriptor => {
    resolved.set(descriptor.key, {
      descriptor: {
        ...descriptor
      },
      records: observed.get(descriptor.key)?.records ?? []
    })
  })

  observed.forEach((entry, key) => {
    if (!resolved.has(key)) {
      resolved.set(key, entry)
    }
  })

  return Array.from(resolved.values())
    .sort((left, right) => compareGroupBuckets(left.descriptor, right.descriptor, property, group))
    .map(entry => ({
      ...entry.descriptor,
      records: [...entry.records]
    }))
}
