import { ChevronDown } from 'lucide-react'
import { getDocumentFields } from '@dataview/core/document'
import { FilterRulePopover } from '@dataview/react/page/features/filter'
import {
  getAvailableFilterProperties,
  getFilterFieldId
} from '@dataview/react/page/features/filter/filterUi'
import { SortPopover, getAvailableSorterProperties } from '@dataview/react/page/features/sort'
import {
  useCurrentView,
  useDataView,
  useDocument,
  usePageValue,
} from '@dataview/react/dataview'
import { Popover } from '@ui/popover'
import { meta, renderMessage } from '@dataview/meta'
import type { QueryBarEntry } from '@dataview/react/page/session/types'
import { QueryChip } from '../query'
import { FieldPicker } from './FieldPicker'

export type ViewQueryOpenEntry = QueryBarEntry

export const ViewQueryBar = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const page = dataView.page
  const document = useDocument()
  const fields = getDocumentFields(document)
  const queryBar = usePageValue(state => state.query)
  const currentView = useCurrentView(view => view?.view)
  const currentViewDomain = currentView
    ? engine.view(currentView.id)
    : undefined
  const filters = currentView?.query.filter.rules ?? []
  const sorts = currentView?.query.sorters ?? []
  const availableFilterProperties = getAvailableFilterProperties(fields, filters)
  const availableSorterProperties = getAvailableSorterProperties(fields, sorts)

  if (!currentView || !queryBar.visible || (!filters.length && !sorts.length)) {
    return null
  }

  return (
    <section className="flex flex-wrap items-center gap-1.5 pt-1 text-card-foreground">
      {sorts.length ? (
        <SortPopover
          open={queryBar.route?.kind === 'sort'}
          onOpenChange={open => {
            if (open) {
              page.query.open({
                kind: 'sort'
              })
              return
            }

            page.query.close()
          }}
        />
      ) : null}

      {filters.map((rule, index) => (
        <FilterRulePopover
          key={`filter_${getFilterFieldId(rule) ?? index}`}
          property={typeof rule.field === 'string'
            ? fields.find(property => property.id === rule.field)
            : undefined}
          rule={rule}
          open={queryBar.route?.kind === 'filter' && queryBar.route.fieldId === getFilterFieldId(rule)}
          onOpenChange={open => {
            const fieldId = getFilterFieldId(rule)
            if (open && fieldId) {
              page.query.open({
                kind: 'filter',
                fieldId
              })
              return
            }

            page.query.close()
          }}
          onChange={nextRule => {
            currentViewDomain?.filters.update(index, nextRule)
          }}
          onRemove={() => {
            currentViewDomain?.filters.remove(index)
            page.query.close()
          }}
        />
      ))}

      {availableFilterProperties.length ? (
        <Popover
          open={queryBar.route?.kind === 'addFilter'}
          onOpenChange={open => {
            if (open) {
              page.query.open({
                kind: 'addFilter'
              })
              return
            }

            page.query.close()
          }}
          initialFocus={-1}
          mode="blocking"
          backdrop="transparent"
          trigger={(
            <QueryChip
              state={queryBar.route?.kind === 'addFilter' ? 'open' : 'add'}
              trailing={<ChevronDown className="size-[14px] shrink-0" size={14} strokeWidth={1.8} />}
            >
              {`+ ${renderMessage(meta.ui.filter.label)}`}
            </QueryChip>
          )}
          contentClassName="w-[280px] p-0"
        >
          <div className="flex max-h-[72vh] flex-col">
            <FieldPicker
              fields={availableFilterProperties}
              onSelect={fieldId => {
                currentViewDomain?.filters.add(fieldId)
                page.query.open({
                  kind: 'filter',
                  fieldId
                })
              }}
            />
          </div>
        </Popover>
      ) : null}

      {!sorts.length && availableSorterProperties.length ? (
        <Popover
          open={queryBar.route?.kind === 'addSort'}
          onOpenChange={open => {
            if (open) {
              page.query.open({
                kind: 'addSort'
              })
              return
            }

            page.query.close()
          }}
          initialFocus={-1}
          mode="blocking"
          backdrop="transparent"
          trigger={(
            <QueryChip
              state={queryBar.route?.kind === 'addSort' ? 'open' : 'add'}
              trailing={<ChevronDown className="size-[14px] shrink-0" size={14} strokeWidth={1.8} />}
            >
              {`+ ${renderMessage(meta.ui.sort.label)}`}
            </QueryChip>
          )}
          contentClassName="w-[280px] p-0"
        >
          <div className="flex max-h-[72vh] flex-col">
            <FieldPicker
              fields={availableSorterProperties}
              onSelect={fieldId => {
                currentViewDomain?.sorters.add(fieldId)
                page.query.open({
                  kind: 'sort'
                })
              }}
            />
          </div>
        </Popover>
      ) : null}
    </section>
  )
}
