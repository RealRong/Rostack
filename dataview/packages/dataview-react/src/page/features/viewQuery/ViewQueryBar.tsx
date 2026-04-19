import { ChevronDown } from 'lucide-react'
import { FilterRulePopover } from '@dataview/react/page/features/filter'
import { SortPopover } from '@dataview/react/page/features/sort'
import {
  useDataView,
  usePageRuntime,
} from '@dataview/react/dataview'
import { FieldPicker } from '@dataview/react/field/picker'
import { Popover } from '@shared/ui/popover'
import { meta } from '@dataview/meta'
import { useTranslation } from '@shared/i18n/react'
import type { QueryBarEntry } from '@dataview/runtime/page/session/types'
import { QueryChip } from '@dataview/react/page/features/query'
import {
  useStoreValue
} from '@shared/react'

export type ViewQueryOpenEntry = QueryBarEntry

export const ViewQueryBar = () => {
  const { t } = useTranslation()
  const dataView = useDataView()
  const engine = dataView.engine
  const page = dataView.session.page
  const pageRuntime = usePageRuntime()
  const query = useStoreValue(pageRuntime.query)
  const currentView = query.currentView

  const currentViewDomain = currentView
    ? engine.active
    : undefined
  const filters = query.filters
  const sorts = query.sorts
  const availableFilterFields = query.availableFilterFields
  const availableSorterFields = query.availableSortFields

  if (!currentView || !query.visible || (!filters.length && !sorts.length)) {
    return null
  }

  return (
    <section className="flex flex-wrap items-center gap-1.5 pt-1 text-card-foreground">
      {sorts.length ? (
        <SortPopover
          open={query.route?.kind === 'sort'}
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

      {filters.map((entry, index) => (
        <FilterRulePopover
          key={`filter_${entry.rule.fieldId}_${index}`}
          entry={entry}
          open={query.route?.kind === 'filter' && query.route.index === index}
          onOpenChange={open => {
            if (open) {
              page.query.open({
                kind: 'filter',
                index
              })
              return
            }

            page.query.close()
          }}
          onPresetChange={presetId => {
            currentViewDomain?.filters.setPreset(index, presetId)
          }}
          onValueChange={value => {
            currentViewDomain?.filters.setValue(index, value)
          }}
          onRemove={() => {
            currentViewDomain?.filters.remove(index)
            page.query.close()
          }}
        />
      ))}

      {availableFilterFields.length ? (
        <Popover
          open={query.route?.kind === 'addFilter'}
          onOpenChange={open => {
            if (open) {
              page.query.open({
                kind: 'addFilter'
              })
              return
            }

            page.query.close()
          }}
          mode="blocking"
          backdrop="transparent"
          animated={{
            close: false
          }}
        >
          <Popover.Trigger>
            <QueryChip
              state={query.route?.kind === 'addFilter' ? 'open' : 'add'}
              trailing={<ChevronDown className="shrink-0" size={14} strokeWidth={1.8} />}
            >
              {`+ ${t(meta.ui.filter.label)}`}
            </QueryChip>
          </Popover.Trigger>
          <Popover.Content
            initialFocus={-1}
            size="xl"
            padding="none"
          >
            <div className="flex max-h-[72vh] flex-col">
              <FieldPicker
                fields={availableFilterFields}
                onSelect={fieldId => {
                  currentViewDomain?.filters.add(fieldId)
                  page.query.open({
                    kind: 'filter',
                    index: filters.length
                  })
                }}
              />
            </div>
          </Popover.Content>
        </Popover>
      ) : null}

      {!sorts.length && availableSorterFields.length ? (
        <Popover
          open={query.route?.kind === 'addSort'}
          onOpenChange={open => {
            if (open) {
              page.query.open({
                kind: 'addSort'
              })
              return
            }

            page.query.close()
          }}
          mode="blocking"
          backdrop="transparent"
          animated={{
            close: false
          }}
        >
          <Popover.Trigger>
            <QueryChip
              state={query.route?.kind === 'addSort' ? 'open' : 'add'}
              trailing={<ChevronDown className="shrink-0" size={14} strokeWidth={1.8} />}
            >
              {`+ ${t(meta.ui.sort.label)}`}
            </QueryChip>
          </Popover.Trigger>
          <Popover.Content
            initialFocus={-1}
            size="xl"
            padding="none"
          >
            <div className="flex max-h-[72vh] flex-col">
              <FieldPicker
                fields={availableSorterFields}
                onSelect={fieldId => {
                  currentViewDomain?.sort.add(fieldId)
                  page.query.open({
                    kind: 'sort'
                  })
                }}
              />
            </div>
          </Popover.Content>
        </Popover>
      ) : null}
    </section>
  )
}
