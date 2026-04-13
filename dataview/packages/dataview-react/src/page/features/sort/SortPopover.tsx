import { useState } from 'react'
import {
  ArrowUpDown,
  ChevronDown,
  Plus,
  Trash2
} from 'lucide-react'
import { getDocumentFields } from '@dataview/core/document'
import { Menu, type MenuItem } from '@shared/ui/menu'
import { Popover } from '@shared/ui/popover'
import { VerticalReorderList } from '@shared/ui/vertical-reorder-list'
import {
  useDataView,
  useDataViewValue
} from '#dataview-react/dataview'
import { FieldPicker } from '#dataview-react/field/picker'
import { meta, renderMessage } from '@dataview/meta'
import { SortRuleRow } from '#dataview-react/page/features/sort/SortRuleRow'
import {
  getAvailableSorterFields,
  getSorterItemId
} from '#dataview-react/page/features/sort/sortUi'
import { QueryChip } from '#dataview-react/page/features/query'

export interface SortPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const SortPopover = (props: SortPopoverProps) => {
  const dataView = useDataView()
  const engine = dataView.engine
  const document = useDataViewValue(dataView => dataView.engine.select.document)
  const fields = getDocumentFields(document)
  const currentView = useDataViewValue(
    dataView => dataView.engine.active.config
  )
  const sortProjection = useDataViewValue(
    dataView => dataView.engine.active.state,
    state => state?.query.sort
  )
  const currentViewDomain = currentView
    ? engine.active
    : undefined
  const [addSortOpen, setAddSortOpen] = useState(false)
  const sorters = sortProjection?.rules.map(entry => entry.sorter) ?? []
  const availableFields = getAvailableSorterFields(fields, sorters)
  const footerItems: MenuItem[] = [
    ...(availableFields.length
      ? [{
          kind: 'submenu' as const,
          key: 'add',
          label: renderMessage(meta.ui.sort.add),
          leading: <Plus className="size-4 shrink-0" size={16} strokeWidth={1.8} />,
          presentation: 'dropdown' as const,
          placement: 'bottom-start' as const,
          surface: 'panel' as const,
          size: 'xl' as const,
          content: () => (
            <div className="flex max-h-[72vh] flex-col">
              <FieldPicker
                fields={availableFields}
                emptyMessage={meta.ui.fieldPicker.allSorted}
                onSelect={fieldId => {
                  currentViewDomain?.sort.add(fieldId)
                  setAddSortOpen(false)
                }}
              />
            </div>
          )
        }]
      : []),
    {
      kind: 'action',
      key: 'clear',
      label: renderMessage(meta.ui.sort.clear),
      leading: <Trash2 className="size-4 shrink-0" size={16} strokeWidth={1.8} />,
      tone: 'destructive',
      onSelect: () => {
        currentViewDomain?.sort.clear()
        props.onOpenChange(false)
      }
    }
  ]

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
      closeOnInteractOutside={false}
      mode="blocking"
      backdrop="transparent"
    >
      <Popover.Trigger>
        <QueryChip
          state={'active'}
          leading={<ArrowUpDown className="size-[14px] shrink-0" size={14} strokeWidth={1.8} />}
          trailing={<ChevronDown className="size-[14px] shrink-0" size={14} strokeWidth={1.8} />}
        >
          {renderMessage(meta.sort.summary(sorters).message)}
        </QueryChip>
      </Popover.Trigger>
      <Popover.Content
        initialFocus={-1}
        padding="none"
        contentClassName="w-[360px]"
      >
        <div className="flex max-h-[72vh] flex-col p-2">
          <VerticalReorderList
            items={sorters}
            getItemId={getSorterItemId}
            onMove={(from, to) => {
              currentViewDomain?.sort.move(from, to)
            }}
            renderItem={(sorter, drag, index) => (
              <SortRuleRow
                fields={fields}
                sorters={sorters}
                index={index}
                sorter={sorter}
                drag={drag}
                onChange={nextSorter => {
                  currentViewDomain?.sort.replace(index, nextSorter)
                }}
                onRemove={() => {
                  currentViewDomain?.sort.remove(index)

                  if (sorters.length === 1) {
                    props.onOpenChange(false)
                  }
                }}
              />
            )}
          />

          <div className="mt-2 flex flex-col gap-0.5 border-t border-divider pt-1">
            <Menu
              items={footerItems}
              autoFocus={false}
              submenuOpenPolicy="click"
              openSubmenuKey={addSortOpen ? 'add' : null}
              onOpenSubmenuChange={key => {
                setAddSortOpen(key === 'add')
              }}
            />
          </div>
        </div>
      </Popover.Content>
    </Popover>
  )
}
