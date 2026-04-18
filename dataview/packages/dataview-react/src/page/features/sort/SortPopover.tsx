import { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Plus,
  Trash2
} from 'lucide-react'
import {
  Menu,
  type MenuActionItem,
  type MenuItem,
  type MenuSubmenuItem
} from '@shared/ui/menu'
import { Popover } from '@shared/ui/popover'
import { VerticalReorderList } from '@shared/ui/vertical-reorder-list'
import {
  useDataView,
  usePageRuntime
} from '@dataview/react/dataview'
import { FieldPicker } from '@dataview/react/field/picker'
import { meta } from '@dataview/meta'
import { SortRuleRow } from '@dataview/react/page/features/sort/SortRuleRow'
import { useTranslation } from '@shared/i18n/react'
import {
  getAvailableSorterFields
} from '@dataview/runtime'
import {
  getSorterItemId,
  readSortSummary
} from '@dataview/react/page/features/sort/sortUi'
import { QueryChip } from '@dataview/react/page/features/query'
import {
  useStoreValue
} from '@shared/react'

export interface SortPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const SortPopover = (props: SortPopoverProps) => {
  const { t } = useTranslation()
  const dataView = useDataView()
  const engine = dataView.engine
  const pageRuntime = usePageRuntime()
  const settings = useStoreValue(pageRuntime.settings)
  const queryBar = useStoreValue(pageRuntime.queryBar)
  const fields = settings.fields
  const currentView = settings.currentView
  const currentViewDomain = currentView
    ? engine.active
    : undefined
  const [addSortOpen, setAddSortOpen] = useState(false)
  const sortRules = queryBar.sorts
  const sorters = sortRules.map(entry => entry.sorter)
  const singleSortDirection = sortRules.length === 1
    ? sortRules[0]?.sorter.direction
    : undefined
  const availableFields = getAvailableSorterFields(fields, sorters)
  const addItem: MenuSubmenuItem | null = availableFields.length
    ? {
      kind: 'submenu',
      key: 'add',
      label: t(meta.ui.sort.add),
      leading: <Plus className="size-4 shrink-0" size={16} strokeWidth={1.8} />,
      presentation: 'dropdown',
      placement: 'bottom-start',
      surface: 'panel',
      size: 'xl',
      padding: 'none',
      content: () => (
        <FieldPicker
          fields={availableFields}
          emptyMessage={meta.ui.fieldPicker.allSorted}
          onSelect={fieldId => {
            currentViewDomain?.sort.add(fieldId)
            setAddSortOpen(false)
          }}
        />
      )
    }
    : null
  const clearItem: MenuActionItem = {
    kind: 'action',
    key: 'clear',
    label: t(meta.ui.sort.clear),
    leading: <Trash2 className="size-4 shrink-0" size={16} strokeWidth={1.8} />,
    tone: 'destructive',
    onSelect: () => {
      currentViewDomain?.sort.clear()
      props.onOpenChange(false)
    }
  }
  const footerItems: readonly MenuItem[] = addItem
    ? [addItem, clearItem]
    : [clearItem]

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
          leading={singleSortDirection === 'asc'
            ? <ArrowUp className="shrink-0" size={14} strokeWidth={1.8} />
            : singleSortDirection === 'desc'
              ? <ArrowDown className="shrink-0" size={14} strokeWidth={1.8} />
              : <ArrowUpDown className="shrink-0" size={14} strokeWidth={1.8} />}
          trailing={<ChevronDown className="shrink-0" size={14} strokeWidth={1.8} />}
        >
          {readSortSummary(sortRules, t)}
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

          <div className="mt-2 flex flex-col gap-0.5 border-t border-divider pt-2">
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
