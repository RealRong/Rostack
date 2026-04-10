import type {
  DataDoc,
  RecordId,
  Row,
  View,
  ViewGroup
} from '@dataview/core/contracts'
import {
  getDocumentFieldById
} from '@dataview/core/document'
import {
  compareGroupBuckets,
  getFieldGroupMeta,
  getRecordFieldValue,
  resolveFieldGroupBucketDomain,
  resolveFieldGroupBucketEntries,
  type Bucket
} from '@dataview/core/field'
import {
  compareGroupSortValues,
  compareLabels,
  readBucketOrder,
  readBucketSortValue
} from '@dataview/core/field/kind/group'
import type {
  IndexState
} from '../../index/types'
import {
  recordIdsOfAppearances
} from './appearances'
import type {
  Appearance,
  AppearanceId,
  AppearanceList,
  ProjectionSection,
  Section,
  SectionBucket,
  SectionKey
} from '../types'
import type {
  Stage
} from '../runtime/stage'
import {
  isReconcile,
  reuse,
  shouldRun
} from '../runtime/stage'

const ROOT_SECTION_KEY = 'root' as SectionKey
const emptyIds = [] as const

const sameIds = (
  left: readonly AppearanceId[],
  right: readonly AppearanceId[]
) => left.length === right.length
  && left.every((value, index) => value === right[index])

const sameBucket = (
  left: SectionBucket | undefined,
  right: SectionBucket | undefined
) => {
  if (!left || !right) {
    return left === right
  }

  return left.key === right.key
    && left.title === right.title
    && left.value === right.value
    && left.clearValue === right.clearValue
    && left.empty === right.empty
    && left.color === right.color
}

const sameSection = (
  left: Section,
  right: Section
) => left.key === right.key
  && left.title === right.title
  && left.color === right.color
  && left.collapsed === right.collapsed
  && sameIds(left.ids, right.ids)
  && sameBucket(left.bucket, right.bucket)

const createAppearanceId = (input: {
  section: SectionKey
  recordId: RecordId
  slot: number
}): AppearanceId => `section:${input.section}\u0000record:${input.recordId}\u0000slot:${input.slot}`

const compareResolvedGroupBuckets = (
  left: Bucket,
  right: Bucket,
  field: ReturnType<typeof getDocumentFieldById>,
  group?: Partial<Pick<ViewGroup, 'bucketSort' | 'mode'>>
) => {
  if (field?.kind === 'title') {
    const bucketSort = getFieldGroupMeta(field, group).sort || 'manual'
    switch (bucketSort) {
      case 'labelAsc':
        return compareLabels(left.title, right.title) || readBucketOrder(left) - readBucketOrder(right)
      case 'labelDesc':
        return compareLabels(right.title, left.title) || readBucketOrder(left) - readBucketOrder(right)
      case 'valueAsc':
        return compareGroupSortValues(readBucketSortValue(left), readBucketSortValue(right))
          || compareLabels(left.title, right.title)
          || readBucketOrder(left) - readBucketOrder(right)
      case 'valueDesc':
        return compareGroupSortValues(readBucketSortValue(right), readBucketSortValue(left))
          || compareLabels(left.title, right.title)
          || readBucketOrder(left) - readBucketOrder(right)
      case 'manual':
      default:
        return readBucketOrder(left) - readBucketOrder(right) || compareLabels(left.title, right.title)
    }
  }

  return compareGroupBuckets(left, right, field, group)
}

const materializeAppearances = (input: {
  section: SectionKey
  recordIds: readonly RecordId[]
  appearances: Map<AppearanceId, Appearance>
}): readonly AppearanceId[] => {
  const slots = new Map<RecordId, number>()

  return input.recordIds.map(recordId => {
    const slot = slots.get(recordId) ?? 0
    slots.set(recordId, slot + 1)

    const id = createAppearanceId({
      section: input.section,
      recordId,
      slot
    })

    input.appearances.set(id, {
      id,
      recordId,
      section: input.section
    })

    return id
  })
}

const createGroupedProjection = (input: {
  document: DataDoc
  view: View
  visibleRecords: readonly Row[]
  index: IndexState
}): {
  appearances: ReadonlyMap<AppearanceId, Appearance>
  sections: readonly ProjectionSection[]
} => {
  const group = input.view.group
  if (!group) {
    return createFlatProjection(input.visibleRecords)
  }

  const field = getDocumentFieldById(input.document, group.field)
  const fieldIndex = input.index.group.fields.get(group.field)
  if (!field || !fieldIndex) {
    return {
      appearances: new Map(),
      sections: []
    }
  }

  const visibleRowsById = new Map(
    input.visibleRecords.map(record => [record.id, record] as const)
  )
  const domain = resolveFieldGroupBucketDomain(field, group)
  const descriptors = new Map(
    domain.map(bucket => [bucket.key, { ...bucket }] as const)
  )
  const appearances = new Map<AppearanceId, Appearance>()
  const observed = new Map<string, {
    descriptor: Bucket
    records: RecordId[]
  }>()

  input.visibleRecords.forEach(record => {
    const bucketKeys = fieldIndex.recordBuckets.get(record.id) ?? []
    if (!bucketKeys.length) {
      return
    }

    const resolvedEntries = resolveFieldGroupBucketEntries(
      field,
      getRecordFieldValue(record, group.field),
      group
    )

    bucketKeys.forEach(bucketKey => {
      const current = observed.get(bucketKey)
      if (current) {
        current.records.push(record.id)
        return
      }

      const descriptor = descriptors.get(bucketKey)
        ?? resolvedEntries.find(entry => entry.key === bucketKey)
      if (!descriptor) {
        return
      }

      descriptors.set(bucketKey, {
        ...descriptor
      })
      observed.set(bucketKey, {
        descriptor: {
          ...descriptor
        },
        records: [record.id]
      })
    })
  })

  const resolved = new Map<string, {
    descriptor: Bucket
    records: RecordId[]
  }>()

  descriptors.forEach((descriptor, bucketKey) => {
    resolved.set(bucketKey, {
      descriptor: {
        ...descriptor
      },
      records: observed.get(bucketKey)?.records ?? []
    })
  })

  observed.forEach((entry, bucketKey) => {
    if (!resolved.has(bucketKey)) {
      resolved.set(bucketKey, entry)
    }
  })

  const sections = Array.from(resolved.values())
    .sort((left, right) => compareResolvedGroupBuckets(
      left.descriptor,
      right.descriptor,
      field,
      group
    ))
    .map(entry => ({
      key: entry.descriptor.key,
      title: entry.descriptor.title,
      color: entry.descriptor.color,
      bucket: {
        key: entry.descriptor.key,
        title: entry.descriptor.title,
        value: entry.descriptor.value,
        clearValue: entry.descriptor.clearValue,
        empty: entry.descriptor.empty,
        color: entry.descriptor.color
      },
      ids: materializeAppearances({
        section: entry.descriptor.key,
        recordIds: entry.records.filter(recordId => visibleRowsById.has(recordId)),
        appearances
      })
    } satisfies ProjectionSection))

  return {
    appearances,
    sections
  }
}

const createFlatProjection = (
  visibleRecords: readonly Row[]
): {
  appearances: ReadonlyMap<AppearanceId, Appearance>
  sections: readonly ProjectionSection[]
} => {
  const appearances = new Map<AppearanceId, Appearance>()
  const section: ProjectionSection = {
    key: ROOT_SECTION_KEY,
    title: 'All',
    ids: materializeAppearances({
      section: ROOT_SECTION_KEY,
      recordIds: visibleRecords.map(record => record.id),
      appearances
    })
  }

  return {
    appearances,
    sections: [section]
  }
}

export const buildSectionProjection = (input: {
  document: DataDoc
  view: View
  visibleRecords: readonly Row[]
  index: IndexState
}) => (
  input.view.group
    ? createGroupedProjection(input)
    : createFlatProjection(input.visibleRecords)
)

export const createSections = (
  source: readonly ProjectionSection[],
  group: ViewGroup | undefined
): readonly Section[] => {
  if (!group) {
    return source.map(section => ({
      ...section,
      collapsed: false
    }))
  }

  const showEmpty = group.showEmpty !== false

  return source.flatMap(section => {
    const state = group.buckets?.[section.key]
    if (state?.hidden === true) {
      return []
    }

    if (!showEmpty && section.ids.length === 0) {
      return []
    }

    return [{
      ...section,
      collapsed: state?.collapsed === true
    } satisfies Section]
  })
}

const reconcileSections = (
  previous: readonly Section[] | undefined,
  next: readonly Section[]
): readonly Section[] => {
  if (!previous?.length || !next.length) {
    return next
  }

  const previousByKey = new Map(
    previous.map(section => [section.key, section] as const)
  )
  const reconciled = next.map(section => {
    const current = previousByKey.get(section.key)
    if (!current) {
      return section
    }

    const ids = sameIds(current.ids, section.ids)
      ? current.ids
      : section.ids
    const bucket = sameBucket(current.bucket, section.bucket)
      ? current.bucket
      : section.bucket
    const candidate: Section = {
      ...section,
      ids,
      bucket
    }

    return sameSection(current, candidate)
      ? current
      : candidate
  })

  return previous.length === reconciled.length
    && reconciled.every((section, index) => section === previous[index])
    ? previous
    : reconciled
}

export const sectionIds = (
  source: readonly Pick<Section, 'key' | 'ids'>[],
  sectionKey: SectionKey
) => source.find(section => section.key === sectionKey)?.ids ?? emptyIds

export const readSectionRecordIds = (input: {
  sections: readonly Pick<Section, 'key' | 'ids'>[]
  appearances: Pick<AppearanceList, 'get'>
}, sectionKey: SectionKey): readonly RecordId[] => {
  const ids = sectionIds(input.sections, sectionKey)
  return ids.length
    ? recordIdsOfAppearances(input.appearances, ids)
    : emptyIds
}

export const sectionsStage: Stage<readonly Section[]> = {
  run: input => {
    if (!shouldRun(input.action)) {
      return reuse(input)
    }

    const view = input.next.read.view()
    if (!view) {
      return undefined
    }

    const sectionProjection = input.next.read.sectionProjection()
    const next = createSections(
      sectionProjection.sections,
      view.group
    )

    return isReconcile(input.action)
      ? reconcileSections(input.prev, next)
      : next
  }
}
