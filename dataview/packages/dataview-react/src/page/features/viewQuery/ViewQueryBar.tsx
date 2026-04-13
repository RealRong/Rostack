import { ChevronDown } from 'lucide-react'
import { getDocumentFields } from '@dataview/core/document'
import { FilterRulePopover } from '#dataview-react/page/features/filter'
import {
  getAvailableFilterFields,
  getFilterFieldId
} from '#dataview-react/page/features/filter/filterUi'
import { SortPopover, getAvailableSorterFields } from '#dataview-react/page/features/sort'
import {
  useDataView,
  useDataViewValue,
} from '#dataview-react/dataview'
import { FieldPicker } from '#dataview-react/field/picker'
import { Popover } from '@shared/ui/popover'
import { meta, renderMessage } from '@dataview/meta'
import type { QueryBarEntry } from '#dataview-react/page/session/types'
import { QueryChip } from '#dataview-react/page/features/query'

export type ViewQueryOpenEntry = QueryBarEntry

export const ViewQueryBar = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const page = dataView.page
  const document = useDataViewValue(dataView => dataView.engine.select.document)
  const fields = getDocumentFields(document)
  const queryBar = useDataViewValue(
    dataView => dataView.page.store,
    state => state.query
  )
  const currentView = useDataViewValue(
    dataView => dataView.engine.active.config
  )

  const filterProjection = useDataViewValue(
    dataView => dataView.engine.active.state,
    state => state?.query.filters
  )
  const sortProjection = useDataViewValue(
    dataView => dataView.engine.active.state,
    state => state?.query.sort
  )

  const currentViewDomain = currentView
    ? engine.active
    : undefined
  const filters = filterProjection?.rules ?? []
  const sorts = sortProjection?.rules ?? []
  const availableFilterFields = getAvailableFilterFields(
    fields,
    filters.map(entry => entry.rule)
  )
  const availableSorterFields = getAvailableSorterFields(
    fields,
    sorts.map(entry => entry.sorter)
  )

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

      {filters.map((entry, index) => (
        <FilterRulePopover
          key={`filter_${entry.fieldId}_${index}`}
          entry={entry}
          open={queryBar.route?.kind === 'filter' && queryBar.route.fieldId === getFilterFieldId(entry.rule)}
          onOpenChange={open => {
            const fieldId = getFilterFieldId(entry.rule)
            if (open && fieldId) {
              page.query.open({
                kind: 'filter',
                fieldId
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
          mode="blocking"
          backdrop="transparent"
        >
          <Popover.Trigger>
            <QueryChip
              state={queryBar.route?.kind === 'addFilter' ? 'open' : 'add'}
              trailing={<ChevronDown className="size-[14px] shrink-0" size={14} strokeWidth={1.8} />}
            >
              {`+ ${renderMessage(meta.ui.filter.label)}`}
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
                    fieldId
                  })
                }}
              />
            </div>
          </Popover.Content>
        </Popover>
      ) : null}

      {!sorts.length && availableSorterFields.length ? (
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
          mode="blocking"
          backdrop="transparent"
        >
          <Popover.Trigger>
            <QueryChip
              state={queryBar.route?.kind === 'addSort' ? 'open' : 'add'}
              trailing={<ChevronDown className="size-[14px] shrink-0" size={14} strokeWidth={1.8} />}
            >
              {`+ ${renderMessage(meta.ui.sort.label)}`}
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
