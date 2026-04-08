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
import { modifiers } from '@dataview/react/interaction'
import { DragGhost } from '@dataview/react/dom/dragGhost'
import {
  closestTarget,
  hasInteractiveTarget,
  interactiveSelector
} from '@dataview/dom/interactive'
import {
  useCurrentView,
  useDataView,
  usePageValue
} from '@dataview/react/dataview'
import {
  resolveDefaultAutoPanTargets
} from '@dataview/react/interaction/autoPan'
import { useStoreValue } from '@dataview/react/store'
import { type CellRef } from '@dataview/react/runtime/currentView'
import { applyPaste, handleTableKey } from '../../input'
import {
  gridContentBounds,
  gridTemplate
} from '../../layout'
import { useTableContext } from '../../context'
import { useColumnResize } from '../../hooks/useColumnResize'
import { useColumnReorder } from '../../hooks/useColumnReorder'
import { useRowReorder } from '../../hooks/useRowReorder'
import { usePointer } from '../../hooks/usePointer'
import { hasTableTarget } from '../../dom/targets'
import { RowDropIndicator } from '../overlay/RowDropIndicator'
import { BlockContent } from './BlockContent'
import { Surface } from './Surface'

const View = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const selection = dataView.selection
  const table = useTableContext()
  const currentView = useCurrentView()
  if (!currentView) {
    throw new Error('Table body requires an active current view.')
  }

  const locked = usePageValue(state => state.lock !== null)
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
    getHitIds: session => table.nodes.hitRows(currentView.appearances.ids, session.box),
    order: () => currentView.appearances.ids,
    previewSelection: nextSelection => {
      table.marqueeSelection.set(nextSelection)
    },
    clearPreviewSelection: () => {
      table.marqueeSelection.set(null)
    },
    resolveAutoPanTargets: () => resolveDefaultAutoPanTargets(table.layout.containerRef.current),
    onStart: () => {
      table.nodes.startRowMarquee(currentView.appearances.ids)
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
    currentView.appearances.ids,
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
    const recordId = currentView.appearances.get(cell.appearanceId)?.recordId
    const record = recordId
      ? engine.read.record.get(recordId)
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
          rowCount={currentView.appearances.ids.length}
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
