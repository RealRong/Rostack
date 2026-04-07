import { useState } from 'react'
import {
  ArrowUpDown,
  ChevronDown,
  Plus,
  Trash2
} from 'lucide-react'
import { getDocumentFields } from '@dataview/core/document'
import { Button } from '@ui/button'
import { Popover } from '@ui/popover'
import { VerticalReorderList } from '@ui/vertical-reorder-list'
import {
  useCurrentView,
  useDataView,
  useDocument
} from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import { FieldPicker } from '@dataview/react/page/features/viewQuery/FieldPicker'
import { SortRuleRow } from './SortRuleRow'
import {
  getAvailableSorterFields,
  getSorterItemId
} from './sortUi'
import { QueryChip } from '../query'

export interface SortPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const SortPopover = (props: SortPopoverProps) => {
  const dataView = useDataView()
  const engine = dataView.engine
  const document = useDocument()
  const fields = getDocumentFields(document)
  const currentView = useCurrentView(view => view?.view)
  const currentViewDomain = currentView
    ? engine.view(currentView.id)
    : undefined
  const [addSortOpen, setAddSortOpen] = useState(false)
  const sorters = currentView?.query.sorters ?? []
  const availableFields = getAvailableSorterFields(fields, sorters)

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
      mode="blocking"
      backdrop="transparent"
      padding="none"
      trigger={(
        <QueryChip
          state={'active'}
          leading={<ArrowUpDown className="size-[14px] shrink-0" size={14} strokeWidth={1.8} />}
          trailing={<ChevronDown className="size-[14px] shrink-0" size={14} strokeWidth={1.8} />}
        >
          {renderMessage(meta.sort.summary(sorters).message)}
        </QueryChip>
      )}
      contentClassName="w-[360px]"
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
              fields={fields}
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

        <div className="mt-2 flex flex-col gap-0.5 border-t border-divider pt-1">
          {availableFields.length ? (
            <Popover
              open={addSortOpen}
              onOpenChange={setAddSortOpen}
              initialFocus={-1}
              placement="bottom-start"
              size="xl"
              padding="none"
              trigger={(
                <Button
                  layout="row"
                  leading={<Plus className="size-4 shrink-0" size={16} strokeWidth={1.8} />}
                >
                  {renderMessage(meta.ui.sort.add)}
                </Button>
              )}
            >
              <div className="flex max-h-[72vh] flex-col">
                <FieldPicker
                  fields={availableFields}
                  emptyMessage={meta.ui.fieldPicker.allSorted}
                  onSelect={fieldId => {
                    currentViewDomain?.sorters.add(fieldId)
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
