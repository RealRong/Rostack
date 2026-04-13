import type {
  PointerEvent as ReactPointerEvent
} from 'react'
import type {
  Field,
  FieldId
} from '@dataview/core/contracts'
import type {
  ItemId
} from '@dataview/engine'
import {
  useStoreValue
} from '@shared/react'
import { useTableContext } from '#react/views/table/context'
import { Row } from '#react/views/table/components/row/Row'
import { ColumnFooterBlock } from '#react/views/table/components/body/ColumnFooterBlock'
import { ColumnHeaderBlock } from '#react/views/table/components/body/ColumnHeaderBlock'
import { SectionHeader } from '#react/views/table/components/body/SectionHeader'

export interface BlockContentProps {
  columns: readonly Field[]
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

export const BlockContent = (props: BlockContentProps) => {
  const table = useTableContext()
  const window = useStoreValue(table.virtual.window)
  const blocks = window.items

  return (
    <div
      style={{
        overflowAnchor: 'none',
        position: 'relative',
        height: window.totalHeight
      }}
    >
      {blocks.length ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            transform: `translateY(${window.startTop}px)`
          }}
        >
          {blocks.map(block => {
            switch (block.kind) {
              case 'section-header':
                return (
                  <div
                    key={block.key}
                    style={{
                      height: block.height
                    }}
                  >
                    <SectionHeader section={block.section} />
                  </div>
                )
              case 'column-header':
                return (
                  <div
                    key={block.key}
                    style={{
                      height: block.height
                    }}
                  >
                    <ColumnHeaderBlock
                      scopeId={block.scopeId}
                      rowIds={block.rowIds}
                      label={block.label}
                      columns={props.columns}
                      template={props.template}
                      resizingPropertyId={props.resizingPropertyId}
                      onResizeStart={props.onResizeStart}
                    />
                  </div>
                )
              case 'row':
                return (
                  <div
                    key={block.key}
                    style={{
                      height: block.height
                    }}
                  >
                    <Row
                      itemId={block.rowId}
                      template={props.template}
                      rowHeight={table.layout.rowHeight}
                      marqueeActive={props.marqueeActive}
                      dragActive={props.dragActive}
                      isDragging={props.dragIdSet.has(block.rowId)}
                      onDragStart={props.onDragStart}
                    />
                  </div>
                )
              case 'column-footer':
                return (
                  <div
                    key={block.key}
                    style={{
                      height: block.height
                    }}
                  >
                    <ColumnFooterBlock
                      scopeId={block.scopeId}
                      columns={props.columns}
                      template={props.template}
                    />
                  </div>
                )
            }
          })}
        </div>
      ) : null}
    </div>
  )
}
