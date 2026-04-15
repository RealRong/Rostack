import {
  memo,
  useCallback,
  useMemo,
  type ClipboardEventHandler,
  type KeyboardEventHandler
} from 'react'
import {
  closestCenter,
  DndContext
} from '@dnd-kit/core'
import { modifiers } from '@dataview/react/interaction'
import { DragGhost } from '@dataview/react/dom/dragGhost'
import {
  closestTarget,
  hasInteractiveTarget,
  interactiveSelector
} from '@shared/dom'
import {
  useDataView
} from '@dataview/react/dataview'
import {
  resolveDefaultAutoPanTargets
} from '@dataview/react/interaction/autoPan'
import { useStoreValue } from '@shared/react'
import { type CellRef } from '@dataview/engine'
import { applyPaste, handleTableKey } from '@dataview/react/views/table/input'
import {
  gridContentBounds,
  gridTemplate
} from '@dataview/react/views/table/layout'
import { useTableContext } from '@dataview/react/views/table/context'
import { useColumnResize } from '@dataview/react/views/table/hooks/useColumnResize'
import { useColumnReorder } from '@dataview/react/views/table/hooks/useColumnReorder'
import { useRowReorder } from '@dataview/react/views/table/hooks/useRowReorder'
import { usePointer } from '@dataview/react/views/table/hooks/usePointer'
import { hasTableTarget } from '@dataview/react/views/table/dom/targets'
import { RowDropIndicator } from '@dataview/react/views/table/components/overlay/RowDropIndicator'
import { BlockContent } from '@dataview/react/views/table/components/body/BlockContent'
import { Surface } from '@dataview/react/views/table/components/body/Surface'
import { useRegisterMarqueeAdapter } from '@dataview/react/views/shared/interactionRuntime'
import type { MarqueeAdapter } from '@dataview/react/runtime/marquee'

const View = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const table = useTableContext()
  const currentView = useStoreValue(table.currentView)
  if (!currentView) {
    throw new Error('Table body requires an active current view.')
  }

  const locked = useStoreValue(table.locked)
  const columns = currentView.fields.all
  const showVerticalLinesStore = useMemo(() => engine.active.select(
    state => state?.view.options.table.showVerticalLines ?? false
  ), [engine])
  const showVerticalLines = useStoreValue(showVerticalLinesStore)
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

  const marqueeAdapter = useMemo<MarqueeAdapter>(() => ({
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
      table.selection.cells.clear()
      table.rowRail.set(null)
      table.hover.clear()
    },
    onEnd: () => {
      table.nodes.endRowMarquee()
      table.focus()
    },
    onCancel: () => {
      table.nodes.endRowMarquee()
    }
  }), [
    currentView.items.ids,
    currentView.view.id,
    marqueeDisabled,
    table.layout.containerRef,
    table
  ])
  useRegisterMarqueeAdapter(marqueeAdapter)

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
      selection: table.selection,
      locked,
      readCell,
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
    table
  ])
  const onPaste = useCallback<ClipboardEventHandler<HTMLDivElement>>(event => {
    const currentGridSelection = table.selection.cells.get()
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
            viewId={currentView.view.id}
            items={currentView.items}
            showVerticalLines={showVerticalLines}
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
