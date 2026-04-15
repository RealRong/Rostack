import type {
  PointerEvent as ReactPointerEvent
} from 'react'
import {
  memo,
  useCallback,
  useMemo
} from 'react'
import type {
  Field,
  FieldId,
  ViewId
} from '@dataview/core/contracts'
import type {
  ItemId,
  ItemList
} from '@dataview/engine'
import {
  sameOrder
} from '@shared/core'
import {
  useStoreValue
} from '@shared/react'
import { useStoreSelector } from '@dataview/react/dataview/storeSelector'
import { useMeasuredHeights } from '@dataview/react/virtual'
import { useTableContext } from '@dataview/react/views/table/context'
import { Row } from '@dataview/react/views/table/components/row/Row'
import { ColumnFooterBlock } from '@dataview/react/views/table/components/body/ColumnFooterBlock'
import { ColumnHeaderBlock } from '@dataview/react/views/table/components/body/ColumnHeaderBlock'
import { SectionHeader } from '@dataview/react/views/table/components/body/SectionHeader'
import type {
  TableBlock
} from '@dataview/react/views/table/virtual'

export interface BlockContentProps {
  columns: readonly Field[]
  viewId: ViewId
  items: ItemList
  showVerticalLines: boolean
  wrapCells: boolean
  template: string
  marqueeActive: boolean
  dragActive: boolean
  dragIdSet: ReadonlySet<ItemId>
  onDragStart: (input: {
    rowId: ItemId
    event: ReactPointerEvent<HTMLButtonElement>
  }) => void
  resizingPropertyId?: FieldId
  onResizeStart: (
    fieldId: FieldId,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => void
}

const sameBlock = (
  left: TableBlock,
  right: TableBlock
) => {
  if (
    left.kind !== right.kind
    || left.key !== right.key
    || left.top !== right.top
    || left.height !== right.height
  ) {
    return false
  }

  switch (left.kind) {
    case 'row':
      return right.kind === 'row'
        && left.rowId === right.rowId
    case 'column-header':
      return right.kind === 'column-header'
        && left.scopeId === right.scopeId
        && left.label === right.label
        && left.scope.key === right.scope.key
        && left.scope.revision === right.scope.revision
        && left.scope.count === right.scope.count
    case 'column-footer':
      return right.kind === 'column-footer'
        && left.scopeId === right.scopeId
    case 'section-header':
      return right.kind === 'section-header'
        && left.section.key === right.section.key
        && left.section.title === right.section.title
        && left.section.collapsed === right.section.collapsed
        && sameOrder(left.section.recordIds, right.section.recordIds)
  }
}

const sameBlocks = (
  left: readonly TableBlock[],
  right: readonly TableBlock[]
) => sameOrder(left, right, sameBlock)

interface RenderedBlocksProps extends BlockContentProps {
  blocks: readonly TableBlock[]
  startTop: number
  measure: (id: string) => (node: HTMLElement | null) => void
}

const RenderedBlocksView = (props: RenderedBlocksProps) => {
  const table = useTableContext()

  if (!props.blocks.length) {
    return null
  }

  return (
    <div
      className="relative min-w-full w-max"
      style={{
        transform: `translateY(${props.startTop}px)`
      }}
    >
      {props.blocks.map(block => {
        const blockMeasureRef = props.measure(block.key)
        switch (block.kind) {
          case 'section-header':
            return (
              <SectionHeader
                key={block.key}
                section={block.section}
                measureRef={blockMeasureRef}
              />
            )
          case 'column-header':
            return (
              <ColumnHeaderBlock
                key={block.key}
                scopeId={block.scopeId}
                scope={block.scope}
                label={block.label}
                measureRef={blockMeasureRef}
                columns={props.columns}
                wrapCells={props.wrapCells}
                template={props.template}
                resizingPropertyId={props.resizingPropertyId}
                onResizeStart={props.onResizeStart}
              />
            )
          case 'row':
            return (
              <Row
                key={block.key}
                itemId={block.rowId}
                recordId={props.items.get(block.rowId)?.recordId}
                viewId={props.viewId}
                measureRef={blockMeasureRef}
                showVerticalLines={props.showVerticalLines}
                wrapCells={props.wrapCells}
                columns={props.columns}
                template={props.template}
                rowHeight={table.layout.rowHeight}
                marqueeActive={props.marqueeActive}
                dragActive={props.dragActive}
                isDragging={props.dragIdSet.has(block.rowId)}
                onDragStart={props.onDragStart}
              />
            )
          case 'column-footer':
            return (
              <ColumnFooterBlock
                key={block.key}
                scopeId={block.scopeId}
                measureRef={blockMeasureRef}
                columns={props.columns}
                wrapCells={props.wrapCells}
                template={props.template}
              />
            )
        }
      })}
    </div>
  )
}

const sameRenderedBlocks = (
  left: RenderedBlocksProps,
  right: RenderedBlocksProps
) => (
  left.startTop === right.startTop
  && left.measure === right.measure
  && sameBlocks(left.blocks, right.blocks)
  && left.columns === right.columns
  && left.viewId === right.viewId
  && left.items === right.items
  && left.showVerticalLines === right.showVerticalLines
  && left.wrapCells === right.wrapCells
  && left.template === right.template
  && left.marqueeActive === right.marqueeActive
  && left.dragActive === right.dragActive
  && left.dragIdSet === right.dragIdSet
  && left.onDragStart === right.onDragStart
  && left.resizingPropertyId === right.resizingPropertyId
  && left.onResizeStart === right.onResizeStart
)

const RenderedBlocks = memo(RenderedBlocksView, sameRenderedBlocks)

export const BlockContent = (props: BlockContentProps) => {
  const table = useTableContext()
  const currentView = useStoreValue(table.currentView)
  const totalHeight = useStoreSelector(
    table.virtual.window,
    snapshot => snapshot.totalHeight
  )
  const startTop = useStoreSelector(
    table.virtual.window,
    snapshot => snapshot.startTop
  )
  const blocks = useStoreSelector(
    table.virtual.window,
    snapshot => snapshot.items,
    sameBlocks
  )
  const containerWidth = useStoreSelector(
    table.virtual.viewport,
    snapshot => snapshot.containerWidth
  )
  const measurementIds = useMemo(() => {
    if (!currentView) {
      return [] as string[]
    }

    if (!currentView.view.group) {
      return [
        'column-header:flat',
        ...currentView.items.ids.map(id => `row:${id}`),
        'column-footer:flat'
      ]
    }

    return currentView.sections.all.flatMap(section => (
      section.collapsed
        ? [`section-header:${section.key}`]
        : [
            `section-header:${section.key}`,
            `column-header:${section.key}`,
            ...section.items.ids.map(id => `row:${id}`),
            `column-footer:${section.key}`
          ]
    ))
  }, [currentView])
  const measurementBucketKey = useMemo(
    () => `${props.template}:${containerWidth}:${props.wrapCells ? 'wrap' : 'nowrap'}`,
    [containerWidth, props.template, props.wrapCells]
  )
  const onMeasurementsChange = useCallback((input: {
    bucketKey: string | number
    heightById: ReadonlyMap<string, number>
    changedHeightById?: ReadonlyMap<string, number>
    removedIds?: readonly string[]
    reset?: boolean
  }) => {
    table.virtual.measurement.sync({
      bucketKey: input.bucketKey,
      heightById: input.heightById,
      changedHeightById: input.changedHeightById,
      removedKeys: input.removedIds,
      reset: input.reset
    })
  }, [table.virtual])
  const measured = useMeasuredHeights<string>({
    ids: measurementIds,
    bucketKey: measurementBucketKey,
    debugName: 'flushTableBlockMeasurementsMicrotask',
    reactive: false,
    onMeasurementsChange
  })

  return (
    <div
      className="relative min-w-full"
      style={{
        overflowAnchor: 'none',
        height: totalHeight
      }}
    >
      <RenderedBlocks
        {...props}
        blocks={blocks}
        startTop={startTop}
        measure={measured.measure}
      />
    </div>
  )
}
