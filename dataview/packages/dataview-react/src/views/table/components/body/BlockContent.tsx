import type {
  PointerEvent as ReactPointerEvent
} from 'react'
import {
  memo,
  useCallback,
  useMemo
} from 'react'
import type {
  FieldId
} from '@dataview/core/contracts'
import type {
  ItemId
} from '@dataview/engine'
import type {
  TableColumn
} from '@dataview/runtime'
import { useMeasuredHeights } from '@dataview/react/virtual'
import { useTableContext } from '@dataview/react/views/table/context'
import { Row } from '@dataview/react/views/table/components/row/Row'
import { ColumnFooterBlock } from '@dataview/react/views/table/components/body/ColumnFooterBlock'
import { ColumnHeaderBlock } from '@dataview/react/views/table/components/body/ColumnHeaderBlock'
import { CreateRecordBlock } from '@dataview/react/views/table/components/body/CreateRecordBlock'
import { SectionHeader } from '@dataview/react/views/table/components/body/SectionHeader'
import type {
  TableBlock
} from '@dataview/react/views/table/virtual'

export interface BlockContentProps {
  columns: readonly TableColumn[]
  showVerticalLines: boolean
  wrap: boolean
  marqueeActive: boolean
  blocks: readonly TableBlock[]
  totalHeight: number
  startTop: number
  measurementIds: readonly string[]
  containerWidth: number
  template: string
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

interface RenderedBlocksProps extends BlockContentProps {
  measure: (id: string) => (node: HTMLElement | null) => void
}

const RenderedBlocksView = (props: RenderedBlocksProps) => {
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
                sectionId={block.sectionId}
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
                showVerticalLines={props.showVerticalLines}
                wrap={props.wrap}
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
                measureRef={blockMeasureRef}
                columns={props.columns}
                showVerticalLines={props.showVerticalLines}
                wrap={props.wrap}
                marqueeActive={props.marqueeActive}
                template={props.template}
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
                template={props.template}
              />
            )
          case 'create-record':
            return (
              <CreateRecordBlock
                key={block.key}
                sectionId={block.sectionId}
                measureRef={blockMeasureRef}
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
  left.columns === right.columns
  && left.showVerticalLines === right.showVerticalLines
  && left.wrap === right.wrap
  && left.marqueeActive === right.marqueeActive
  && left.blocks === right.blocks
  && left.totalHeight === right.totalHeight
  && left.startTop === right.startTop
  && left.measurementIds === right.measurementIds
  && left.containerWidth === right.containerWidth
  && left.measure === right.measure
  && left.template === right.template
  && left.dragActive === right.dragActive
  && left.dragIdSet === right.dragIdSet
  && left.onDragStart === right.onDragStart
  && left.resizingPropertyId === right.resizingPropertyId
  && left.onResizeStart === right.onResizeStart
)

const RenderedBlocks = memo(RenderedBlocksView, sameRenderedBlocks)

export const BlockContent = (props: BlockContentProps) => {
  const table = useTableContext()
  const measurementBucketKey = useMemo(
    () => `${props.containerWidth}:${props.wrap ? 'wrap' : 'nowrap'}`,
    [props.containerWidth, props.wrap]
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
    ids: props.measurementIds,
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
        height: props.totalHeight
      }}
    >
      <RenderedBlocks
        {...props}
        measure={measured.measure}
      />
    </div>
  )
}
