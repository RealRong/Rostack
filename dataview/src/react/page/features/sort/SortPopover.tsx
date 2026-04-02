import { useState } from 'react'
import {
  ArrowUpDown,
  ChevronDown,
  Plus,
  Trash2
} from 'lucide-react'
import { getDocumentProperties } from '@dataview/core/document'
import { Button } from '@ui/button'
import { Popover } from '@ui/popover'
import { QueryChip } from '@ui/query-chip'
import { VerticalReorderList } from '@ui/vertical-reorder-list'
import {
  useCurrentView,
  useDataView,
  useDocument
} from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import { PropertyPicker } from '@dataview/react/page/features/viewQuery/PropertyPicker'
import { SortRuleRow } from './SortRuleRow'
import {
  getAvailableSorterProperties,
  getSorterItemId
} from './sortUi'

export interface SortPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const SortPopover = (props: SortPopoverProps) => {
  const dataView = useDataView()
  const engine = dataView.engine
  const document = useDocument()
  const properties = getDocumentProperties(document)
  const currentView = useCurrentView(view => view?.view)
  const currentViewDomain = currentView
    ? engine.view(currentView.id)
    : undefined
  const [addSortOpen, setAddSortOpen] = useState(false)
  const sorters = currentView?.query.sorters ?? []
  const availableProperties = getAvailableSorterProperties(properties, sorters)

  if (!sorters.length) {
    return null
  }

  return (
    <Popover
      open={props.open}
      onOpenChange={open => {
        props.onOpenChange(open)
        if (!open) {
          setAddSortOpen(false)
        }
      }}
      initialFocus={-1}
      closeOnInteractOutside={false}
      surface="blocking"
      backdrop="transparent"
      trigger={(
        <QueryChip
          state={props.open ? 'open' : 'active'}
          leading={<ArrowUpDown className="size-[14px] shrink-0" size={14} strokeWidth={1.8} />}
          trailing={<ChevronDown className="size-[14px] shrink-0" size={14} strokeWidth={1.8} />}
        >
          {renderMessage(meta.sort.summary(sorters).message)}
        </QueryChip>
      )}
      contentClassName="w-[360px] p-0"
    >
      <div className="flex max-h-[72vh] flex-col p-2">
        <VerticalReorderList
          items={sorters}
          getItemId={getSorterItemId}
          onMove={(from, to) => {
            currentViewDomain?.sorters.move(from, to)
          }}
          renderItem={(sorter, drag, index) => (
            <SortRuleRow
              properties={properties}
              sorters={sorters}
              index={index}
              sorter={sorter}
              drag={drag}
              onChange={nextSorter => {
                currentViewDomain?.sorters.replace(index, nextSorter)
              }}
              onRemove={() => {
                currentViewDomain?.sorters.remove(index)

                if (sorters.length === 1) {
                  props.onOpenChange(false)
                }
              }}
            />
          )}
        />

        <div className="ui-divider-top mt-2 flex flex-col gap-0.5 pt-1">
          {availableProperties.length ? (
            <Popover
              open={addSortOpen}
              onOpenChange={setAddSortOpen}
              initialFocus={-1}
              placement="bottom-start"
              surface="scoped"
              trigger={(
                <Button
                  layout="row"
                  leading={<Plus className="size-4 shrink-0" size={16} strokeWidth={1.8} />}
                >
                  {renderMessage(meta.ui.sort.add)}
                </Button>
              )}
              contentClassName="w-[280px] p-0"
            >
              <div className="flex max-h-[72vh] flex-col">
                <PropertyPicker
                  properties={availableProperties}
                  emptyMessage={meta.ui.fieldPicker.allSorted}
                  onSelect={propertyId => {
                    currentViewDomain?.sorters.add(propertyId)
                    setAddSortOpen(false)
                  }}
                />
              </div>
            </Popover>
          ) : null}

          <Button
            variant="ghostDestructive"
            layout="row"
            leading={<Trash2 className="size-4 shrink-0" size={16} strokeWidth={1.8} />}
            onClick={() => {
              currentViewDomain?.sorters.clear()
              props.onOpenChange(false)
            }}
          >
            {renderMessage(meta.ui.sort.clear)}
          </Button>
        </div>
      </div>
    </Popover>
  )
}
