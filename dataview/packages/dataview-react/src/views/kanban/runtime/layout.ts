import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type RefObject
} from 'react'
import { equal, store } from '@shared/core'
import {
  elementRectIn,
  observeElementSize,
  type Rect
} from '@shared/dom'
import {
  useStoreValue
} from '@shared/react'
import type {
  ItemId,
  Section,
  SectionKey
} from '@dataview/engine'
import {
  buildBoardLayout,
  type BoardLayout
} from '@dataview/react/views/kanban/drag'
import type {
  KanbanVisibilityRuntime
} from '@dataview/react/views/kanban/runtime/visibility'
import {
  useMeasuredHeights
} from '@dataview/react/virtual'

export interface KanbanLayoutRuntime {
  board: store.ReadStore<BoardLayout | null>
  body: store.KeyedReadStore<SectionKey, Rect | undefined>
  measure: {
    body: (sectionKey: SectionKey) => (node: HTMLDivElement | null) => void
    card: (id: ItemId) => (node: HTMLElement | null) => void
  }
}

export const useKanbanLayout = (input: {
  containerRef: RefObject<HTMLDivElement | null>
  sections: readonly Section[]
  sectionsStore: store.ReadStore<readonly Section[]>
  visibility: KanbanVisibilityRuntime
}): KanbanLayoutRuntime => {
  const visibilityVersion = useStoreValue(input.visibility.version)
  const visibleIds = useMemo(
    () => input.sections.flatMap(section => (
      input.visibility.all().get(section.key)?.ids ?? section.itemIds
    )),
    [input.sections, input.visibility, visibilityVersion]
  )
  const measured = useMeasuredHeights({
    ids: visibleIds
  })
  const bodyStore = useMemo(() => store.createKeyedStore<SectionKey, Rect | undefined>({
    emptyValue: undefined,
    isEqual: equal.sameOptionalRect
  }), [])
  const bodyVersion = useMemo(() => store.createValueStore(0), [])
  const heightStore = useMemo(() => store.createValueStore<ReadonlyMap<ItemId, number>>(new Map<ItemId, number>(), {
    isEqual: equal.sameMap
  }), [])
  const bodyNodeBySectionKeyRef = useRef(new Map<SectionKey, HTMLDivElement>())
  const cleanupBySectionKeyRef = useRef(new Map<SectionKey, () => void>())
  const bodyMeasureRefBySectionKeyRef = useRef(new Map<SectionKey, (node: HTMLDivElement | null) => void>())

  const bumpBodyVersion = useCallback(() => {
    bodyVersion.update(current => current + 1)
  }, [bodyVersion])

  useEffect(() => {
    heightStore.set(measured.heightById)
  }, [heightStore, measured.heightById])

  const syncBodyRect = useCallback((sectionKey: SectionKey) => {
    const container = input.containerRef.current
    const node = bodyNodeBySectionKeyRef.current.get(sectionKey)
    if (!container || !node) {
      if (bodyStore.get(sectionKey) === undefined) {
        return
      }

      bodyStore.delete(sectionKey)
      bumpBodyVersion()
      return
    }

    const nextRect = elementRectIn(container, node)
    const previousRect = bodyStore.get(sectionKey)
    if (equal.sameOptionalRect(previousRect, nextRect)) {
      return
    }

    bodyStore.set(sectionKey, nextRect)
    bumpBodyVersion()
  }, [
    bodyStore,
    bumpBodyVersion,
    input.containerRef
  ])

  useEffect(() => {
    const activeSectionKeys = new Set(input.sections.map(section => section.key))
    Array.from(bodyNodeBySectionKeyRef.current.keys()).forEach(sectionKey => {
      if (activeSectionKeys.has(sectionKey)) {
        return
      }

      cleanupBySectionKeyRef.current.get(sectionKey)?.()
      cleanupBySectionKeyRef.current.delete(sectionKey)
      bodyNodeBySectionKeyRef.current.delete(sectionKey)
      bodyMeasureRefBySectionKeyRef.current.delete(sectionKey)
      if (bodyStore.get(sectionKey) !== undefined) {
        bodyStore.delete(sectionKey)
        bumpBodyVersion()
      }
    })
  }, [bodyStore, bumpBodyVersion, input.sections])

  useEffect(() => () => {
    cleanupBySectionKeyRef.current.forEach(cleanup => {
      cleanup()
    })
    cleanupBySectionKeyRef.current.clear()
    bodyNodeBySectionKeyRef.current.clear()
    bodyMeasureRefBySectionKeyRef.current.clear()
    bodyStore.clear()
  }, [bodyStore])

  const measureBody = useCallback((sectionKey: SectionKey) => {
    const cached = bodyMeasureRefBySectionKeyRef.current.get(sectionKey)
    if (cached) {
      return cached
    }

    const ref = (node: HTMLDivElement | null) => {
      const previousNode = bodyNodeBySectionKeyRef.current.get(sectionKey)
      if (previousNode === node) {
        if (node) {
          syncBodyRect(sectionKey)
        }
        return
      }

      cleanupBySectionKeyRef.current.get(sectionKey)?.()
      cleanupBySectionKeyRef.current.delete(sectionKey)

      if (!node) {
        bodyNodeBySectionKeyRef.current.delete(sectionKey)
        syncBodyRect(sectionKey)
        return
      }

      bodyNodeBySectionKeyRef.current.set(sectionKey, node)
      cleanupBySectionKeyRef.current.set(sectionKey, observeElementSize(node, {
        emitInitial: false,
        onChange: () => {
          syncBodyRect(sectionKey)
        }
      }))
      syncBodyRect(sectionKey)
    }

    bodyMeasureRefBySectionKeyRef.current.set(sectionKey, ref)
    return ref
  }, [syncBodyRect])

  const board = useMemo(() => store.createDerivedStore<BoardLayout | null>({
    get: () => {
      store.read(bodyVersion)
      store.read(input.visibility.version)
      const sections = store.read(input.sectionsStore)
      const heightById = store.read(heightStore)
      const bodyRectBySectionKey = new Map<SectionKey, Rect>()
      bodyStore.all().forEach((rect, sectionKey) => {
        if (rect) {
          bodyRectBySectionKey.set(sectionKey, rect)
        }
      })
      return buildBoardLayout({
        sections,
        visibilityBySection: input.visibility.all(),
        bodyRectBySectionKey,
        heightById
      })
    }
  }), [
    bodyStore,
    bodyVersion,
    heightStore,
    input.sectionsStore,
    input.visibility
  ])

  return useMemo(() => ({
    board,
    body: bodyStore,
    measure: {
      body: measureBody,
      card: measured.measure
    }
  }), [
    board,
    bodyStore,
    measureBody,
    measured.measure
  ])
}
