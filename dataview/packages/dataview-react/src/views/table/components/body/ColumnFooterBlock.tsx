import type {
  Field
} from '@dataview/core/contracts'
import {
  memo
} from 'react'
import { meta } from '@dataview/meta'
import { useDataView } from '@dataview/react/dataview'
import { useTranslation } from '@shared/i18n/react'
import {
  useKeyedStoreValue
} from '@shared/react'
import { useTableContext } from '@dataview/react/views/table/context'
import {
  TABLE_CELL_INLINE_PADDING,
  TABLE_TRAILING_ACTION_WIDTH
} from '@dataview/react/views/table/layout'

export interface ColumnFooterBlockProps {
  scopeId: string
  measureRef?: (node: HTMLDivElement | null) => void
  columns: readonly Field[]
  wrap: boolean
  template: string
}

const View = (props: ColumnFooterBlockProps) => {
  const {
    t,
    formatNumber,
    formatPercent
  } = useTranslation()
  const dataView = useDataView()
  const table = useTableContext()
  const summary = useKeyedStoreValue(dataView.table.summary, props.scopeId)
  const calculations = summary?.byField

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
          const content = (() => {
            if (!result) {
              return null
            }

            switch (result.kind) {
              case 'empty':
                return null
              case 'scalar':
                return (
                  <div className='flex items-center justify-end w-full ml-auto'>
                    <div className="text-sm leading-none text-muted-foreground">
                      {t(meta.calculation.metric.get(result.metric).token)}
                    </div>
                    <div className="ml-2 leading-none font-medium">
                      {formatNumber(result.value)}
                    </div>
                  </div>
                )
              case 'percent':
                return (
                  <div className='flex items-center justify-end w-full ml-auto'>
                    <div className="text-sm leading-none text-muted-foreground">
                      {t(meta.calculation.metric.get(result.metric).token)}
                    </div>
                    <div className="ml-2 leading-none font-medium">
                      {formatPercent(result.value)}
                    </div>
                  </div>
                )
              case 'distribution':
                return (
                  <div className="min-w-0 flex flex-col gap-1.5">
                    <div className="text-xs leading-none text-muted-foreground">
                      {t(meta.calculation.metric.get(result.metric).token)}
                    </div>
                    <div className="min-w-0 text-xs flex flex-col gap-1 leading-snug text-foreground">
                      {result.items.slice(0, 3).map((item, index) => (
                        <div key={`${item.key}:${index}`} className="truncate">
                          {t(item.value)}
                          {': '}
                          {result.metric === 'percentByOption'
                            ? formatPercent(item.percent)
                            : formatNumber(item.count)}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              default:
                return null
            }
          })()

          return (
            <div
              key={field.id}
              className={'min-w-0 box-border flex items-start'}
              style={{
                paddingInline: TABLE_CELL_INLINE_PADDING,
                paddingBlock: 12
              }}
            >
              {content}
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
  && left.wrap === right.wrap
  && left.template === right.template
)

export const ColumnFooterBlock = memo(View, same)
