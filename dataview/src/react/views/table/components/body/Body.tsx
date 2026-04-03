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
import { hasInteractiveTarget } from '@dataview/dom/interactive'
import {
  useCurrentView,
  useDataView,
  usePageValue
} from '@dataview/react/dataview'
import { useStoreValue } from '@dataview/react/store'
import { type FieldId } from '@dataview/react/runtime/currentView'
import { applyPaste, handleTableKey } from '../../input'
import {
  gridContentBounds,
  gridTemplate
} from '../../layout'
import { useTableContext } from '../../context'
import { useColumnResize } from '../../hooks/useColumnResize'
import { useColumnReorder } from '../../hooks/useColumnReorder'
import { useRowMarquee } from '../../hooks/useRowMarquee'
import { useRowReorder } from '../../hooks/useRowReorder'
import { usePointer } from '../../hooks/usePointer'
import { RowDropIndicator } from '../overlay/RowDropIndicator'
import { FlatContent } from './FlatContent'
import { GroupedContent } from './GroupedContent'
import { MarqueeOverlay } from '../overlay/MarqueeOverlay'
import { Surface } from './Surface'

const View = () => {
  const engine = useDataView().engine
  const selection = useDataView().selection
  const table = useTableContext()
  const currentView = useCurrentView()
  if (!currentView) {
    throw new Error('Table body requires an active current view.')
  }

  const locked = usePageValue(state => state.lock !== null)
  const columns = currentView.properties.all
  const capabilities = useStoreValue(table.capabilities)
  const columnResize = useColumnResize()
  const template = useMemo(
    () => gridTemplate(columns, columnResize.widths),
    [columnResize.widths, columns]
  )
  const columnReorder = useColumnReorder()
  const rowReorder = useRowReorder()
  const marquee = useRowMarquee(
    rowReorder.active || columnResize.active
  )
  const pointer = usePointer({
    enabled: (
      capabilities.canHover
      && !marquee.active
      && !rowReorder.active
      && !columnResize.active
    ),
    onBlankPointerDown: marquee.onPointerDown
  })
  const readCell = useCallback((cell: FieldId) => {
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
          <MarqueeOverlay box={marquee.box} />
          {rowIndicatorTop !== null && gridBounds ? (
            <RowDropIndicator
              top={rowIndicatorTop}
              left={gridBounds.left}
              width={Math.max(0, gridBounds.right - gridBounds.left)}
            />
          ) : null}
          {currentView.view.query.group ? (
            <GroupedContent
              sections={currentView.sections}
              columns={columns}
              template={template}
              marqueeActive={marquee.active}
              dragActive={rowReorder.active}
              dragIdSet={rowReorder.dragIdSet}
              onDragStart={rowReorder.startDrag}
              resizingPropertyId={columnResize.preview?.propertyId}
              onResizeStart={columnResize.onResizeStart}
            />
          ) : (
            <FlatContent
              rowIds={currentView.appearances.ids}
              columns={columns}
              template={template}
              marqueeActive={marquee.active}
              dragActive={rowReorder.active}
              dragIdSet={rowReorder.dragIdSet}
              onDragStart={rowReorder.startDrag}
              resizingPropertyId={columnResize.preview?.propertyId}
              onResizeStart={columnResize.onResizeStart}
            />
          )}
        </Surface>
      </DndContext>
      <DragGhost
        active={rowReorder.overlay.active}
        node={rowReorder.overlay.node}
        pointerRef={rowReorder.overlay.pointerRef}
        offsetRef={rowReorder.overlay.overlayOffsetRef}
        badge={rowReorder.overlay.extraCount ? (
          <span className="ui-accent-chip rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
            +{rowReorder.overlay.extraCount}
          </span>
        ) : undefined}
      />
    </>
  )
}

export const Body = memo(View)
