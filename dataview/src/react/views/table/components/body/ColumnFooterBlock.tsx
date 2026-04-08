import type {
  Field
} from '@dataview/core/contracts'
import {
  useCurrentView
} from '@dataview/react/dataview'

export interface ColumnFooterBlockProps {
  scopeId: string
  columns: readonly Field[]
  template: string
}

export const ColumnFooterBlock = (props: ColumnFooterBlockProps) => {
  const currentView = useCurrentView()
  if (!currentView) {
    throw new Error('Table footer requires an active current view.')
  }

  const calculations = currentView.calculationsBySection.get(props.scopeId)
  return (
    <div
      className="grid h-full min-w-0 items-center text-sm text-muted-foreground"
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
  )
}
