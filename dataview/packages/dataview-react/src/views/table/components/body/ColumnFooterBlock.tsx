import type {
  Field
} from '@dataview/core/contracts'
import {
  memo
} from 'react'
import { useStoreValue } from '@shared/react'
import { useTableContext } from '@dataview/react/views/table/context'
import {
  TABLE_CELL_BLOCK_PADDING,
  TABLE_CELL_INLINE_PADDING,
  TABLE_TRAILING_ACTION_WIDTH
} from '@dataview/react/views/table/layout'

export interface ColumnFooterBlockProps {
  scopeId: string
  measureRef?: (node: HTMLDivElement | null) => void
  columns: readonly Field[]
  wrapCells: boolean
  template: string
}

const View = (props: ColumnFooterBlockProps) => {
  const table = useTableContext()
  const currentView = useStoreValue(table.currentView)
  if (!currentView) {
    throw new Error('Table footer requires an active current view.')
  }

  const calculations = currentView.summaries.get(props.scopeId)
  return (
    <div
      ref={props.measureRef}
      className="flex self-stretch min-w-full w-max items-stretch text-sm text-muted-foreground"
      style={{
        minHeight: table.layout.headerHeight
      }}
    >
      <div
        className="inline-grid min-w-0 flex-none items-stretch"
        style={{
          gridTemplateColumns: props.template
        }}
      >
        {props.columns.map(field => {
          const result = calculations?.get(field.id)

          return (
            <div
              key={field.id}
              className={'min-w-0 box-border flex items-start'}
              style={{
                paddingInline: TABLE_CELL_INLINE_PADDING,
                paddingBlock: TABLE_CELL_BLOCK_PADDING
              }}
            >
              {result ? <><div className='leading-none'>{result?.metric}</div>: <div className='text-base ml-1 leading-none font-medium'>{result?.display}</div></> : null}
            </div>
          )
        })}
      </div>
      <div
        className="shrink-0"
        aria-hidden="true"
        style={{
          width: TABLE_TRAILING_ACTION_WIDTH
        }}
      />
    </div>
  )
}

const same = (
  left: ColumnFooterBlockProps,
  right: ColumnFooterBlockProps
) => (
  left.scopeId === right.scopeId
  && left.measureRef === right.measureRef
  && left.columns === right.columns
  && left.wrapCells === right.wrapCells
  && left.template === right.template
)

export const ColumnFooterBlock = memo(View, same)
