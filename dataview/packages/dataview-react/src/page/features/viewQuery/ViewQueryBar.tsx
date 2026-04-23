import { ChevronDown } from 'lucide-react'
import { FilterRulePopover } from '@dataview/react/page/features/filter'
import { SortPopover } from '@dataview/react/page/features/sort'
import {
  useDataView,
  usePageModel,
} from '@dataview/react/dataview'
import { FieldPicker } from '@dataview/react/field/picker'
import { Popover } from '@shared/ui/popover'
import { meta } from '@dataview/meta'
import { useTranslation } from '@shared/i18n/react'
import type { QueryBarEntry } from '@dataview/runtime'
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
  const pageModel = usePageModel()
  const query = useStoreValue(pageModel.query)
  const currentView = query.view

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
          rules={sorts}
          availableFields={availableSorterFields}
          open={query.route?.kind === 'sort'}
          onOpenChange={open => {
            if (open) {
              const firstRuleId = sorts[0]?.rule.id
              if (!firstRuleId) {
                return
              }

              page.query.open({
                kind: 'sort',
                id: firstRuleId
              })
              return
            }

            page.query.close()
          }}
        />
      ) : null}

      {filters.map(entry => (
        <FilterRulePopover
          key={entry.rule.id}
          entry={entry}
          open={query.route?.kind === 'filter' && query.route.id === entry.rule.id}
          onOpenChange={open => {
            if (open) {
              page.query.open({
                kind: 'filter',
                id: entry.rule.id
              })
              return
            }

            page.query.close()
          }}
          onPresetChange={presetId => {
            currentViewDomain?.filters.patch(entry.rule.id, { presetId })
          }}
          onValueChange={value => {
            currentViewDomain?.filters.patch(entry.rule.id, { value })
          }}
          onRemove={() => {
            currentViewDomain?.filters.remove(entry.rule.id)
            page.query.close()
          }}
        />
      ))}

      {availableFilterFields.length ? (
        <Popover
          open={query.route?.kind === 'filterCreate'}
          onOpenChange={open => {
            if (open) {
              page.query.open({
                kind: 'filterCreate'
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
              state={query.route?.kind === 'filterCreate' ? 'open' : 'add'}
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
                  if (!currentViewDomain) {
                    return
                  }

                  const id = currentViewDomain.filters.create(fieldId)
                  page.query.open({
                    kind: 'filter',
                    id
                  })
                }}
              />
            </div>
          </Popover.Content>
        </Popover>
      ) : null}

      {!sorts.length && availableSorterFields.length ? (
        <Popover
          open={query.route?.kind === 'sortCreate'}
          onOpenChange={open => {
            if (open) {
              page.query.open({
                kind: 'sortCreate'
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
              state={query.route?.kind === 'sortCreate' ? 'open' : 'add'}
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
                  if (!currentViewDomain) {
                    return
                  }

                  const id = currentViewDomain.sort.create(fieldId)
                  page.query.open({
                    kind: 'sort',
                    id
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
