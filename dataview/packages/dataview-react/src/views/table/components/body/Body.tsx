import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  type ClipboardEventHandler,
  type KeyboardEventHandler
} from 'react'
import {
  closestCenter,
  DndContext
} from '@dnd-kit/core'
import { modifiers } from '#react/interaction/index.ts'
import { DragGhost } from '#react/dom/dragGhost.tsx'
import {
  closestTarget,
  hasInteractiveTarget,
  interactiveSelector
} from '@shared/dom'
import {
  useDataView,
  useDataViewValue
} from '#react/dataview/index.ts'
import {
  resolveDefaultAutoPanTargets
} from '#react/interaction/autoPan.ts'
import { useStoreValue } from '@shared/react'
import { type CellRef } from '@dataview/engine'
import { applyPaste, handleTableKey } from '#react/views/table/input.ts'
import {
  gridContentBounds,
  gridTemplate
} from '#react/views/table/layout.ts'
import { useTableContext } from '#react/views/table/context.tsx'
import { useColumnResize } from '#react/views/table/hooks/useColumnResize.ts'
import { useColumnReorder } from '#react/views/table/hooks/useColumnReorder.ts'
import { useRowReorder } from '#react/views/table/hooks/useRowReorder.tsx'
import { usePointer } from '#react/views/table/hooks/usePointer.ts'
import { hasTableTarget } from '#react/views/table/dom/targets.ts'
import { RowDropIndicator } from '#react/views/table/components/overlay/RowDropIndicator.tsx'
import { BlockContent } from '#react/views/table/components/body/BlockContent.tsx'
import { Surface } from '#react/views/table/components/body/Surface.tsx'

const View = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const selection = dataView.selection
  const table = useTableContext()
  const currentView = useStoreValue(table.currentView)
  if (!currentView) {
    throw new Error('Table body requires an active current view.')
  }

  const locked = useDataViewValue(
    dataView => dataView.page.store,
    state => state.lock !== null
  )
  const columns = currentView.fields.all
  const capabilities = useStoreValue(table.capabilities)
  const virtualInteraction = useStoreValue(table.virtual.interaction)
  const marqueeActive = virtualInteraction.marqueeActive
  const columnResize = useColumnResize()
  const template = useMemo(
    () => gridTemplate(columns, columnResize.widths),
    [columnResize.widths, columns]
  )
  const columnReorder = useColumnReorder()
  const rowReorder = useRowReorder()
  const marqueeDisabled = rowReorder.active || columnResize.active
  const onBlankPointerDown = useCallback(() => {
    table.rowRail.set(null)
  }, [table.rowRail])

  useEffect(() => dataView.marquee.registerAdapter({
    viewId: currentView.view.id,
    disabled: marqueeDisabled,
    canStart: event => {
      const container = table.layout.containerRef.current
      return Boolean(
        container
        && event.target instanceof Node
        && container.contains(event.target)
        && !hasTableTarget(event.target)
        && !closestTarget(event.target, interactiveSelector)
      )
    },
    getHitIds: session => table.nodes.hitRows(currentView.items.ids, session.box),
    order: () => currentView.items.ids,
    previewSelection: nextSelection => {
      table.marqueeSelection.set(nextSelection)
    },
    clearPreviewSelection: () => {
      table.marqueeSelection.set(null)
    },
    resolveAutoPanTargets: () => resolveDefaultAutoPanTargets(table.layout.containerRef.current),
    onStart: () => {
      table.nodes.startRowMarquee(currentView.items.ids)
      table.marqueeSelection.set(null)
      table.gridSelection.clear()
      table.rowRail.set(null)
      table.hover.clear()
    },
    onEnd: () => {
      table.nodes.endRowMarquee()
    },
    onCancel: () => {
      table.nodes.endRowMarquee()
    }
  }), [
    currentView.items.ids,
    currentView.view.id,
    dataView.marquee,
    marqueeDisabled,
    table.layout.containerRef,
    table
  ])

  const pointer = usePointer({
    enabled: (
      capabilities.canHover
      && !marqueeActive
      && !rowReorder.active
      && !columnResize.active
    ),
    onBlankPointerDown
  })
  const readCell = useCallback((cell: CellRef) => {
    const recordId = currentView.items.get(cell.itemId)?.recordId
    const record = recordId
      ? engine.select.records.byId.get(recordId)
      : undefined

    return {
      exists: Boolean(record)
    }
  }, [currentView, engine])
  const onKeyDown = useCallback<KeyboardEventHandler<HTMLDivElement>>(event => {
    if (
      event.defaultPrevented
      || hasInteractiveTarget(event.target, event.currentTarget)
    ) {
      return
    }

    if (!handleTableKey({
      key: {
        key: event.key,
        modifiers: modifiers(event)
      },
      editor: engine,
      currentView,
      selection: selection.get(),
      selectionApi: selection,
      locked,
      readCell,
      gridSelection: table.gridSelection,
      openCell: table.openCell,
      reveal: table.revealCursor,
      setKeyboardMode: () => {
        table.interaction.setMode('keyboard')
      }
    })) {
      return
    }

    event.preventDefault()
  }, [
    columns,
    currentView,
    engine,
    locked,
    readCell,
    selection,
    table
  ])
  const onPaste = useCallback<ClipboardEventHandler<HTMLDivElement>>(event => {
    const currentGridSelection = table.gridSelection.get()
    if (locked || !currentGridSelection) {
      return
    }

    const didPaste = applyPaste({
      editor: engine,
      currentView,
      gridSelection: currentGridSelection,
      text: event.clipboardData.getData('text/plain')
    })
    if (!didPaste) {
      return
    }

    table.revealCursor()
    event.preventDefault()
  }, [columns, currentView, engine, locked, table])
  const gridBounds = gridContentBounds({
    container: table.layout.containerRef.current,
    canvas: table.layout.canvasRef.current
  })
  const rowIndicatorTop = rowReorder.hint?.top ?? null

  return (
    <>
      <DndContext
        sensors={columnReorder.sensors}
        onDragStart={columnReorder.onDragStart}
        onDragEnd={columnReorder.onDragEnd}
        onDragCancel={columnReorder.onDragCancel}
        collisionDetection={closestCenter}
      >
        <Surface
          rowCount={currentView.items.ids.length}
          colCount={columns.length}
          onPointerDown={pointer.onPointerDown}
          onPointerMove={pointer.onPointerMove}
          onPointerLeave={pointer.onPointerLeave}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        >
          {rowIndicatorTop !== null && gridBounds ? (
            <RowDropIndicator
              top={rowIndicatorTop}
              left={gridBounds.left}
              width={Math.max(0, gridBounds.right - gridBounds.left)}
            />
          ) : null}
          <BlockContent
            columns={columns}
            template={template}
            marqueeActive={marqueeActive}
            dragActive={rowReorder.active}
            dragIdSet={rowReorder.dragIdSet}
            onDragStart={rowReorder.startDrag}
            resizingPropertyId={columnResize.preview?.fieldId}
            onResizeStart={columnResize.onResizeStart}
          />
        </Surface>
      </DndContext>
      <DragGhost
        active={rowReorder.overlay.active}
        node={rowReorder.overlay.node}
        pointerRef={rowReorder.overlay.pointerRef}
        offsetRef={rowReorder.overlay.overlayOffsetRef}
        badge={rowReorder.overlay.extraCount ? (
          <span className="rounded-full border border-accent-divider bg-accent-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
            +{rowReorder.overlay.extraCount}
          </span>
        ) : undefined}
      />
    </>
  )
}

export const Body = memo(View)
