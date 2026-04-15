import type {
  Field
} from '@dataview/core/contracts'
import { useStoreValue } from '@shared/react'
import { useTableContext } from '@dataview/react/views/table/context'
import { TABLE_TRAILING_ACTION_WIDTH } from '@dataview/react/views/table/layout'

export interface ColumnFooterBlockProps {
  scopeId: string
  columns: readonly Field[]
  template: string
}

export const ColumnFooterBlock = (props: ColumnFooterBlockProps) => {
  const table = useTableContext()
  const currentView = useStoreValue(table.currentView)
  if (!currentView) {
    throw new Error('Table footer requires an active current view.')
  }

  const calculations = currentView.summaries.get(props.scopeId)
  return (
    <div
      className="flex h-full min-w-full w-max items-center text-sm text-muted-foreground"
    >
      <div
        className="inline-grid h-full min-w-0 flex-none items-center"
        style={{
          gridTemplateColumns: props.template
        }}
      >
        {props.columns.map(field => {
          const result = calculations?.get(field.id)

          return (
            <div
              key={field.id}
              className={'min-w-0 flex items-center px-2'}
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
