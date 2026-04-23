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
import { store } from '@shared/core'
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
  const body = useStoreValue(dataView.model.table.body)
  const windowState = useStoreValue(table.virtual.window)
  const measurementPlan = useStoreValue(table.virtual.measurement.plan)
  const viewport = useStoreValue(table.virtual.viewport)
  const interaction = useStoreValue(table.virtual.interaction)
  const displayedFields = useStoreValue(table.displayedFields)
  const items = useStoreValue(dataView.source.active.items.list)
  if (!body || !displayedFields) {
    throw new Error('Table body requires an active table body.')
  }

  const locked = useStoreValue(table.locked)
  const canHover = useStoreValue(table.can.hover)
  const marqueeActive = interaction.marqueeActive
  const previousMarqueeActiveRef = useRef(false)
  const columnResize = useColumnResize()
  const template = useMemo(
    () => gridTemplate(body.columns, columnResize.widths),
    [body.columns, columnResize.widths]
  )
  const columnReorder = useColumnReorder()
  const rowReorder = useRowReorder()
  const marqueeDisabled = rowReorder.active || columnResize.active
  const onBlankPointerDown = useCallback(() => {
    table.rail.set(null)
  }, [table.rail])

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
      table.rail.set(null)
      table.hover.clear()
    } else if (previousMarqueeActiveRef.current) {
      table.focus()
    }

    previousMarqueeActiveRef.current = marqueeActive
  }, [
    marqueeActive,
    table.focus,
    table.hover,
    table.rail,
    table.selection.cells
  ])

  const pointer = usePointer({
    enabled: (
      canHover
      && !marqueeActive
      && !rowReorder.active
      && !columnResize.active
    ),
    onBlankPointerDown
  })
  const readCell = useCallback((cell: CellRef) => {
    const resolved = dataView.model.table.cell.get(cell)
    return {
      exists: Boolean(resolved)
    }
  }, [dataView.model.table.cell])
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
      items,
      fields: displayedFields,
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
    displayedFields,
    engine,
    items,
    locked,
    readCell,
    table
  ])
  const onPaste = useCallback<ClipboardEventHandler<HTMLDivElement>>(event => {
    const currentGridSelection = store.peek(table.selection.cells.store)
    if (locked || !currentGridSelection) {
      return
    }

    const didPaste = applyPaste({
      editor: engine,
      items,
      fields: displayedFields,
      gridSelection: currentGridSelection,
      text: event.clipboardData.getData('text/plain')
    })
    if (!didPaste) {
      return
    }

    table.revealCursor()
    event.preventDefault()
  }, [displayedFields, engine, items, locked, table])
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
          rowCount={body.rowCount}
          colCount={body.columns.length}
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
            columns={body.columns}
            showVerticalLines={body.showVerticalLines}
            wrap={body.wrap}
            marqueeActive={marqueeActive}
            blocks={windowState.items}
            totalHeight={windowState.totalHeight}
            startTop={windowState.startTop}
            measurementIds={measurementPlan.ids}
            containerWidth={viewport.containerWidth}
            template={template}
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
