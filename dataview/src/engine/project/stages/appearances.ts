import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  Appearance,
  AppearanceId,
  AppearanceList,
  Section,
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

const emptyIds = [] as readonly AppearanceId[]

const sameIds = (
  left: readonly AppearanceId[],
  right: readonly AppearanceId[]
) => left.length === right.length
  && left.every((value, index) => value === right[index])

const sameAppearance = (
  left: Appearance,
  right: Appearance
) => left.id === right.id
  && left.recordId === right.recordId
  && left.section === right.section

const createAppearanceList = (input: {
  byId: ReadonlyMap<AppearanceId, Appearance>
  ids: readonly AppearanceId[]
  sections: readonly Section[]
}): AppearanceList => {
  const visibleIndex = new Map<AppearanceId, number>()
  const sectionById = new Map<AppearanceId, SectionKey>()
  const idsBySection = new Map<SectionKey, readonly AppearanceId[]>()

  input.sections.forEach(section => {
    idsBySection.set(section.key, section.ids)

    section.ids.forEach(id => {
      if (!input.byId.has(id)) {
        return
      }

      sectionById.set(id, section.key)
    })
  })

  input.ids.forEach((id, index) => {
    visibleIndex.set(id, index)
  })

  return {
    byId: input.byId,
    ids: input.ids,
    get: id => input.byId.get(id),
    has: id => visibleIndex.has(id),
    indexOf: id => visibleIndex.get(id),
    at: index => input.ids[index],
    prev: id => {
      const index = visibleIndex.get(id)
      return index === undefined || index <= 0
        ? undefined
        : input.ids[index - 1]
    },
    next: id => {
      const index = visibleIndex.get(id)
      return index === undefined || index >= input.ids.length - 1
        ? undefined
        : input.ids[index + 1]
    },
    range: (anchor, focus) => {
      const anchorIndex = visibleIndex.get(anchor)
      const focusIndex = visibleIndex.get(focus)
      if (anchorIndex === undefined || focusIndex === undefined) {
        return emptyIds
      }

      const start = Math.min(anchorIndex, focusIndex)
      const end = Math.max(anchorIndex, focusIndex)
      return input.ids.slice(start, end + 1)
    },
    sectionOf: id => sectionById.get(id),
    idsIn: section => idsBySection.get(section) ?? emptyIds
  }
}

export const createAppearances = (input: {
  byId: ReadonlyMap<AppearanceId, Appearance>
  sections: readonly Section[]
}): AppearanceList => {
  const byId = new Map<AppearanceId, Appearance>()
  const ids: AppearanceId[] = []

  input.sections.forEach(section => {
    section.ids.forEach(id => {
      const appearance = input.byId.get(id)
      if (!appearance) {
        return
      }

      byId.set(id, appearance)
      if (!section.collapsed) {
        ids.push(id)
      }
    })
  })

  return createAppearanceList({
    byId,
    ids,
    sections: input.sections
  })
}

const reconcileAppearances = (input: {
  previous: AppearanceList | undefined
  byId: ReadonlyMap<AppearanceId, Appearance>
  sections: readonly Section[]
}): AppearanceList => {
  if (!input.previous) {
    return createAppearances({
      byId: input.byId,
      sections: input.sections
    })
  }

  const byId = new Map<AppearanceId, Appearance>()
  const visibleIds: AppearanceId[] = []

  input.sections.forEach(section => {
    section.ids.forEach(id => {
      const nextAppearance = input.byId.get(id)
      if (!nextAppearance) {
        return
      }

      const previousAppearance = input.previous?.byId.get(id)
      byId.set(
        id,
        previousAppearance && sameAppearance(previousAppearance, nextAppearance)
          ? previousAppearance
          : nextAppearance
      )

      if (!section.collapsed) {
        visibleIds.push(id)
      }
    })
  })

  const ids = sameIds(input.previous.ids, visibleIds)
    ? input.previous.ids
    : visibleIds

  const reusedEntries = byId.size === input.previous.byId.size
    && Array.from(byId.entries()).every(([id, appearance]) => input.previous?.byId.get(id) === appearance)

  if (ids === input.previous.ids && reusedEntries) {
    return input.previous
  }

  return createAppearanceList({
    byId,
    ids,
    sections: input.sections
  })
}

export const recordIdsOfAppearances = (
  appearances: Pick<AppearanceList, 'get'>,
  ids: readonly AppearanceId[]
): readonly RecordId[] => {
  const seen = new Set<RecordId>()
  const next: RecordId[] = []

  ids.forEach(id => {
    const recordId = appearances.get(id)?.recordId
    if (!recordId || seen.has(recordId)) {
      return
    }

    seen.add(recordId)
    next.push(recordId)
  })

  return next
}

export const appearancesStage: Stage<AppearanceList> = {
  run: input => {
    if (!shouldRun(input.action)) {
      return reuse(input)
    }

    const sections = input.project.sections
    if (!sections) {
      return undefined
    }

    const sectionProjection = input.next.read.sectionProjection()
    return isReconcile(input.action)
      ? reconcileAppearances({
          previous: input.prev,
          byId: sectionProjection.appearances,
          sections
        })
      : createAppearances({
          byId: sectionProjection.appearances,
          sections
        })
  }
}
