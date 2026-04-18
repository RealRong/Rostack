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
import { useMeasuredHeights } from '@dataview/react/virtual'
import { useTableContext } from '@dataview/react/views/table/context'
import { Row } from '@dataview/react/views/table/components/row/Row'
import { ColumnFooterBlock } from '@dataview/react/views/table/components/body/ColumnFooterBlock'
import { ColumnHeaderBlock } from '@dataview/react/views/table/components/body/ColumnHeaderBlock'
import { CreateRecordBlock } from '@dataview/react/views/table/components/body/CreateRecordBlock'
import { SectionHeader } from '@dataview/react/views/table/components/body/SectionHeader'
import type {
  TableBodyData
} from '@dataview/react/views/table/controller'

export interface BlockContentProps {
  body: TableBodyData
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

interface RenderedBlocksProps extends Omit<BlockContentProps, 'body'> {
  body: TableBodyData
  measure: (id: string) => (node: HTMLElement | null) => void
}

const RenderedBlocksView = (props: RenderedBlocksProps) => {
  const table = useTableContext()

  if (!props.body.blocks.length) {
    return null
  }

  return (
    <div
      className="relative min-w-full w-max"
      style={{
        transform: `translateY(${props.body.startTop}px)`
      }}
    >
      {props.body.blocks.map(block => {
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
                columns={props.body.columns}
                showVerticalLines={props.body.showVerticalLines}
                wrap={props.body.wrap}
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
                recordId={props.body.items.get(block.rowId)?.recordId}
                viewId={props.body.viewId}
                measureRef={blockMeasureRef}
                showVerticalLines={props.body.showVerticalLines}
                wrap={props.body.wrap}
                columns={props.body.columns}
                template={props.template}
                rowHeight={table.layout.rowHeight}
                marqueeActive={props.body.marqueeActive}
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
                columns={props.body.columns}
                wrap={props.body.wrap}
                template={props.template}
              />
            )
          case 'create-record':
            return (
              <CreateRecordBlock
                key={block.key}
                sectionKey={block.sectionKey}
                measureRef={blockMeasureRef}
                columns={props.body.columns}
                showVerticalLines={props.body.showVerticalLines}
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
  left.body === right.body
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
  const measurementIds = useMemo(() => {
    if (!props.body.grouped) {
      return [
        'column-header:flat',
        ...props.body.items.ids.map(id => `row:${id}`),
        'create-record:flat',
        'column-footer:flat'
      ]
    }

    return props.body.sections.all.flatMap(section => (
      section.collapsed
        ? [`section-header:${section.key}`]
        : [
            `section-header:${section.key}`,
            `column-header:${section.key}`,
            ...section.items.ids.map(id => `row:${id}`),
            `create-record:${section.key}`,
            `column-footer:${section.key}`
          ]
    ))
  }, [props.body.grouped, props.body.items, props.body.sections])
  const measurementBucketKey = useMemo(
    () => `${props.body.containerWidth}:${props.body.wrap ? 'wrap' : 'nowrap'}`,
    [props.body.containerWidth, props.body.wrap]
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
        height: props.body.totalHeight
      }}
    >
      <RenderedBlocks
        {...props}
        measure={measured.measure}
      />
    </div>
  )
}
