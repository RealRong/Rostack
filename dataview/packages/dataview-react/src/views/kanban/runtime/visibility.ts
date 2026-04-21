import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type {
  KanbanCardsPerColumn
} from '@dataview/core/contracts'
import type {
  Section,
  SectionKey
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
  sections.map(section => [section.key, section.itemIds.length] as const)
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
  section: coreStore.KeyedReadStore<SectionKey, KanbanVisibility | undefined>
  version: coreStore.ReadStore<number>
  showMore: (sectionKey: SectionKey) => void
  reset: () => void
  all: () => ReadonlyMap<SectionKey, KanbanVisibility | undefined>
}

export const useKanbanVisibility = (input: {
  viewId: string
  sections: readonly Section[]
  cardsPerColumn: KanbanCardsPerColumn
}): KanbanVisibilityRuntime => {
  const initialRef = useRef<ReadonlyMap<SectionKey, KanbanVisibility | undefined> | null>(null)
  if (!initialRef.current) {
    initialRef.current = new Map(
      input.sections.map(section => [
        section.key,
        resolveVisibility({
          section,
          cardsPerColumn: input.cardsPerColumn
        })
      ] as const)
    )
  }
  const visibilityStore = useMemo(() => coreStore.createKeyedStore<SectionKey, KanbanVisibility | undefined>({
    emptyValue: undefined,
    initial: initialRef.current ?? undefined,
    isEqual: sameVisibility
  }), [])
  const version = useMemo(() => coreStore.createValueStore(0), [])
  const [expandedCountBySectionKey, setExpandedCountBySectionKey] = useState<Partial<Record<SectionKey, number>>>({})
  const previousSectionLengthsRef = useRef(new Map<SectionKey, number>())
  const sectionIdsByKey = useMemo(() => new Map(
    input.sections.map(section => [section.key, section.itemIds] as const)
  ), [input.sections])

  const bumpVersion = useCallback(() => {
    version.update(current => current + 1)
  }, [version])

  const reset = useCallback(() => {
    previousSectionLengthsRef.current = readSectionLengths(input.sections)
    setExpandedCountBySectionKey({})
  }, [input.sections])

  useEffect(() => {
    reset()
  }, [input.cardsPerColumn, input.viewId, reset])

  useEffect(() => {
    if (input.cardsPerColumn === 'all') {
      previousSectionLengthsRef.current = readSectionLengths(input.sections)
      return
    }

    setExpandedCountBySectionKey(previous => {
      let changed = false
      const next = {
        ...previous
      }
      const previousLengths = previousSectionLengthsRef.current
      const sectionKeys = new Set(input.sections.map(section => section.key))

      Object.keys(next).forEach(sectionKey => {
        if (!sectionKeys.has(sectionKey)) {
          delete next[sectionKey]
          changed = true
        }
      })

      input.sections.forEach(section => {
        const previousLength = previousLengths.get(section.key)
        if (previousLength === undefined) {
          return
        }

        const previousInitialVisible = resolveInitialVisibleCount(
          input.cardsPerColumn,
          previousLength
        )
        const previousExpandedCount = previous[section.key]
        const previousVisible = previousExpandedCount === undefined
          ? previousInitialVisible
          : Math.min(
            previousLength,
            Math.max(previousInitialVisible, previousExpandedCount)
          )
        const currentVisible = next[section.key] === undefined
          ? resolveInitialVisibleCount(input.cardsPerColumn, section.itemIds.length)
          : Math.min(
            section.itemIds.length,
            Math.max(
              resolveInitialVisibleCount(input.cardsPerColumn, section.itemIds.length),
              next[section.key]!
            )
          )

        if (
          section.itemIds.length > previousLength
          && previousVisible >= previousLength
          && currentVisible < section.itemIds.length
        ) {
          next[section.key] = section.itemIds.length
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
    const activeSectionKeys = new Set(input.sections.map(section => section.key))
    const set: Array<readonly [SectionKey, KanbanVisibility | undefined]> = []
    const del: SectionKey[] = []

    input.sections.forEach(section => {
      const next = resolveVisibility({
        section,
        cardsPerColumn: input.cardsPerColumn,
        expandedCount: expandedCountBySectionKey[section.key]
      })
      const previous = current.get(section.key)
      if (!sameVisibility(previous, next)) {
        set.push([section.key, next] as const)
      }
    })

    current.forEach((_, sectionKey) => {
      if (!activeSectionKeys.has(sectionKey)) {
        del.push(sectionKey)
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
    expandedCountBySectionKey,
    input.cardsPerColumn,
    input.sections,
    visibilityStore
  ])

  const showMore = useCallback((sectionKey: SectionKey) => {
    const step = input.cardsPerColumn
    if (step === 'all') {
      return
    }

    setExpandedCountBySectionKey(previous => {
      const sectionIds = sectionIdsByKey.get(sectionKey)
      if (!sectionIds?.length) {
        return previous
      }

      const initialVisible = resolveInitialVisibleCount(
        input.cardsPerColumn,
        sectionIds.length
      )
      const currentVisible = previous[sectionKey] === undefined
        ? initialVisible
        : Math.min(sectionIds.length, Math.max(initialVisible, previous[sectionKey]!))
      const nextVisible = Math.min(
        sectionIds.length,
        currentVisible + step
      )

      if (nextVisible <= currentVisible) {
        return previous
      }

      return {
        ...previous,
        [sectionKey]: nextVisible
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
