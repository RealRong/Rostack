import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type {
  KanbanCardsPerColumn
} from '@dataview/core/types'
import type {
  Section,
  SectionId
} from '@dataview/engine'
import { equal, store as coreStore } from '@shared/core'
import type { KanbanVisibility } from '@dataview/react/views/kanban/types'

const sameVisibility = (
  left: KanbanVisibility | undefined,
  right: KanbanVisibility | undefined
) => left === right || (
  !!left
  && !!right
  && equal.sameOrder(left.ids, right.ids)
  && left.visible === right.visible
  && left.hidden === right.hidden
  && left.more === right.more
)

const resolveInitialVisibleCount = (
  limit: KanbanCardsPerColumn,
  total: number
) => (
  limit === 'all'
    ? total
    : Math.min(total, limit)
)

const readSectionLengths = (
  sections: readonly Section[]
) => new Map(
  sections.map(section => [section.id, section.itemIds.length] as const)
)

const resolveVisibility = (input: {
  section: Section
  cardsPerColumn: KanbanCardsPerColumn
  expandedCount?: number
}): KanbanVisibility => {
  const initialVisible = resolveInitialVisibleCount(
    input.cardsPerColumn,
    input.section.itemIds.length
  )
  const visible = input.expandedCount === undefined
    ? initialVisible
    : Math.min(
      input.section.itemIds.length,
      Math.max(initialVisible, input.expandedCount)
    )
  const hidden = Math.max(0, input.section.itemIds.length - visible)
  const more = input.cardsPerColumn === 'all'
    ? hidden
    : Math.min(hidden, input.cardsPerColumn)

  return {
    ids: input.section.itemIds.slice(0, visible),
    visible,
    hidden,
    more
  }
}

export interface KanbanVisibilityRuntime {
  section: coreStore.KeyedReadStore<SectionId, KanbanVisibility | undefined>
  version: coreStore.ReadStore<number>
  showMore: (sectionId: SectionId) => void
  reset: () => void
  all: () => ReadonlyMap<SectionId, KanbanVisibility | undefined>
}

export const useKanbanVisibility = (input: {
  viewId: string
  sections: readonly Section[]
  cardsPerColumn: KanbanCardsPerColumn
}): KanbanVisibilityRuntime => {
  const initialRef = useRef<ReadonlyMap<SectionId, KanbanVisibility | undefined> | null>(null)
  if (!initialRef.current) {
    initialRef.current = new Map(
      input.sections.map(section => [
        section.id,
        resolveVisibility({
          section,
          cardsPerColumn: input.cardsPerColumn
        })
      ] as const)
    )
  }
  const visibilityStore = useMemo(() => coreStore.keyed<SectionId, KanbanVisibility | undefined>({
    emptyValue: undefined,
    initial: initialRef.current ?? undefined,
    isEqual: sameVisibility
  }), [])
  const version = useMemo(() => coreStore.value(0), [])
  const [expandedCountBySectionId, setExpandedCountBySectionId] = useState<Partial<Record<SectionId, number>>>({})
  const previousSectionLengthsRef = useRef(new Map<SectionId, number>())
  const sectionIdsByKey = useMemo(() => new Map(
    input.sections.map(section => [section.id, section.itemIds] as const)
  ), [input.sections])

  const bumpVersion = useCallback(() => {
    version.update(current => current + 1)
  }, [version])

  const reset = useCallback(() => {
    previousSectionLengthsRef.current = readSectionLengths(input.sections)
    setExpandedCountBySectionId({})
  }, [input.sections])

  useEffect(() => {
    reset()
  }, [input.cardsPerColumn, input.viewId, reset])

  useEffect(() => {
    if (input.cardsPerColumn === 'all') {
      previousSectionLengthsRef.current = readSectionLengths(input.sections)
      return
    }

    setExpandedCountBySectionId(previous => {
      let changed = false
      const next = {
        ...previous
      }
      const previousLengths = previousSectionLengthsRef.current
      const sectionIds = new Set(input.sections.map(section => section.id))

      Object.keys(next).forEach(sectionId => {
        if (!sectionIds.has(sectionId)) {
          delete next[sectionId]
          changed = true
        }
      })

      input.sections.forEach(section => {
        const previousLength = previousLengths.get(section.id)
        if (previousLength === undefined) {
          return
        }

        const previousInitialVisible = resolveInitialVisibleCount(
          input.cardsPerColumn,
          previousLength
        )
        const previousExpandedCount = previous[section.id]
        const previousVisible = previousExpandedCount === undefined
          ? previousInitialVisible
          : Math.min(
            previousLength,
            Math.max(previousInitialVisible, previousExpandedCount)
          )
        const currentVisible = next[section.id] === undefined
          ? resolveInitialVisibleCount(input.cardsPerColumn, section.itemIds.length)
          : Math.min(
            section.itemIds.length,
            Math.max(
              resolveInitialVisibleCount(input.cardsPerColumn, section.itemIds.length),
              next[section.id]!
            )
          )

        if (
          section.itemIds.length > previousLength
          && previousVisible >= previousLength
          && currentVisible < section.itemIds.length
        ) {
          next[section.id] = section.itemIds.length
          changed = true
        }
      })

      return changed
        ? next
        : previous
    })

    previousSectionLengthsRef.current = readSectionLengths(input.sections)
  }, [input.cardsPerColumn, input.sections])

  useEffect(() => {
    const current = visibilityStore.all()
    const activeSectionIds = new Set(input.sections.map(section => section.id))
    const set: Array<readonly [SectionId, KanbanVisibility | undefined]> = []
    const del: SectionId[] = []

    input.sections.forEach(section => {
      const next = resolveVisibility({
        section,
        cardsPerColumn: input.cardsPerColumn,
        expandedCount: expandedCountBySectionId[section.id]
      })
      const previous = current.get(section.id)
      if (!sameVisibility(previous, next)) {
        set.push([section.id, next] as const)
      }
    })

    current.forEach((_, sectionId) => {
      if (!activeSectionIds.has(sectionId)) {
        del.push(sectionId)
      }
    })

    if (!set.length && !del.length) {
      return
    }

    visibilityStore.patch({
      ...(set.length
        ? { set }
        : {}),
      ...(del.length
        ? { delete: del }
        : {})
    })
    bumpVersion()
  }, [
    bumpVersion,
    expandedCountBySectionId,
    input.cardsPerColumn,
    input.sections,
    visibilityStore
  ])

  const showMore = useCallback((sectionId: SectionId) => {
    const step = input.cardsPerColumn
    if (step === 'all') {
      return
    }

    setExpandedCountBySectionId(previous => {
      const sectionIds = sectionIdsByKey.get(sectionId)
      if (!sectionIds?.length) {
        return previous
      }

      const initialVisible = resolveInitialVisibleCount(
        input.cardsPerColumn,
        sectionIds.length
      )
      const currentVisible = previous[sectionId] === undefined
        ? initialVisible
        : Math.min(sectionIds.length, Math.max(initialVisible, previous[sectionId]!))
      const nextVisible = Math.min(
        sectionIds.length,
        currentVisible + step
      )

      if (nextVisible <= currentVisible) {
        return previous
      }

      return {
        ...previous,
        [sectionId]: nextVisible
      }
    })
  }, [input.cardsPerColumn, sectionIdsByKey])

  return useMemo(() => ({
    section: visibilityStore,
    version,
    showMore,
    reset,
    all: () => visibilityStore.all()
  }), [
    reset,
    showMore,
    visibilityStore,
    version
  ])
}
