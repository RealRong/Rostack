import { ChevronDown } from 'lucide-react'
import { FilterRulePopover } from '@dataview/react/page/features/filter'
import {
  getAvailableFilterProperties,
  getFilterPropertyId
} from '@dataview/react/page/features/filter/filterUi'
import { SortPopover, getAvailableSorterProperties } from '@dataview/react/page/features/sort'
import {
  useActiveView,
  useEngine,
  usePageActions,
  usePageValue,
  useProperties
} from '@dataview/react/editor'
import { Popover } from '@ui/popover'
import { QueryChip } from '@ui/query-chip'
import { meta, renderMessage } from '@dataview/meta'
import type { QueryBarEntry } from '@dataview/react/page/session/types'
import { PropertyPicker } from './PropertyPicker'

export type ViewQueryOpenEntry = QueryBarEntry

export const ViewQueryBar = () => {
  const engine = useEngine()
  const page = usePageActions()
  const properties = useProperties()
  const queryBar = usePageValue(state => state.query)
  const currentView = useActiveView()
  const currentViewDomain = currentView
    ? engine.view(currentView.id)
    : undefined
  const filters = currentView?.query.filter.rules ?? []
  const sorts = currentView?.query.sorters ?? []
  const availableFilterProperties = getAvailableFilterProperties(properties, filters)
  const availableSorterProperties = getAvailableSorterProperties(properties, sorts)

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
          key={`filter_${getFilterPropertyId(rule) ?? index}`}
          property={typeof rule.property === 'string'
            ? properties.find(property => property.id === rule.property)
            : undefined}
          rule={rule}
          open={queryBar.route?.kind === 'filter' && queryBar.route.propertyId === getFilterPropertyId(rule)}
          onOpenChange={open => {
            const propertyId = getFilterPropertyId(rule)
            if (open && propertyId) {
              page.query.open({
                kind: 'filter',
                propertyId
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
          surface="blocking"
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
            <PropertyPicker
              properties={availableFilterProperties}
              onSelect={propertyId => {
                currentViewDomain?.filters.add(propertyId)
                page.query.open({
                  kind: 'filter',
                  propertyId
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
          surface="blocking"
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
            <PropertyPicker
              properties={availableSorterProperties}
              onSelect={propertyId => {
                currentViewDomain?.sorters.add(propertyId)
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
