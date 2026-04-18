import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ClipboardEventHandler,
  type KeyboardEventHandler
} from 'react'
import {
  closestCenter,
  DndContext
} from '@dnd-kit/core'
import { modifiers } from '@dataview/react/interaction'
import {
  hasInteractiveTarget,
  rectIn
} from '@shared/dom'
import {
  useDataView
} from '@dataview/react/dataview'
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
import { RowDropIndicator } from '@dataview/react/views/table/components/overlay/RowDropIndicator'
import { BlockContent } from '@dataview/react/views/table/components/body/BlockContent'
import { Surface } from '@dataview/react/views/table/components/body/Surface'
import {
  useRegisterMarqueeScene
} from '@dataview/react/views/shared/interactionRuntime'
import type { MarqueeScene } from '@dataview/react/page/marqueeBridge'

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
  const wrapStore = useMemo(() => engine.active.select(
    state => state?.view.options.table.wrap ?? false
  ), [engine])
  const wrap = useStoreValue(wrapStore)
  const capabilities = useStoreValue(table.capabilities)
  const virtualInteraction = useStoreValue(table.virtual.interaction)
  const marqueeActive = virtualInteraction.marqueeActive
  const previousMarqueeActiveRef = useRef(false)
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

  const marqueeScene = useMemo<MarqueeScene | undefined>(() => (
    marqueeDisabled
      ? undefined
      : {
          hitTest: rect => {
            const container = table.layout.containerRef.current
            if (!container) {
              return []
            }

            const localRect = rectIn(container, rect)
            const bounds = gridContentBounds({
              container,
              canvas: table.layout.canvasRef.current
            })

            if (
              !localRect
              || !bounds
              || localRect.right <= bounds.left
              || localRect.left >= bounds.right
            ) {
              return []
            }

            return table.virtual.hitRows({
              top: localRect.top,
              bottom: localRect.bottom
            })
          }
        }
  ), [
    marqueeDisabled,
    table.layout.canvasRef,
    table.layout.containerRef,
    table.virtual
  ])

  useRegisterMarqueeScene(marqueeScene)

  useEffect(() => {
    if (marqueeActive) {
      table.selection.cells.clear()
      table.rowRail.set(null)
      table.hover.clear()
    } else if (previousMarqueeActiveRef.current) {
      table.focus()
    }

    previousMarqueeActiveRef.current = marqueeActive
  }, [
    marqueeActive,
    table.focus,
    table.hover,
    table.rowRail,
    table.selection.cells
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
  }, [currentView, engine, locked, table])
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
            sections={currentView.sections}
            grouped={Boolean(currentView.view.group)}
            showVerticalLines={showVerticalLines}
            wrap={wrap}
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
    </>
  )
}

export const Body = memo(View)
