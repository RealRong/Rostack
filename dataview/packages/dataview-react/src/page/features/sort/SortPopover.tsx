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
import type {
  Field
} from '@dataview/core/contracts'
import type {
  SortRuleProjection
} from '@dataview/engine'
import { FieldPicker } from '@dataview/react/field/picker'
import { meta } from '@dataview/meta'
import { SortRuleRow } from '@dataview/react/page/features/sort/SortRuleRow'
import { useTranslation } from '@shared/i18n/react'
import {
  getSortRuleItemId,
  readSortSummary
} from '@dataview/react/page/features/sort/sortUi'
import { QueryChip } from '@dataview/react/page/features/query'
import {
  useStoreValue
} from '@shared/react'

export interface SortPopoverProps {
  rules: readonly SortRuleProjection[]
  availableFields: readonly Field[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const SortPopover = (props: SortPopoverProps) => {
  const { t } = useTranslation()
  const dataView = useDataView()
  const engine = dataView.engine
  const page = dataView.session.page
  const pageRuntime = usePageRuntime()
  const settings = useStoreValue(pageRuntime.settings)
  const currentView = settings.activeView
  const currentViewDomain = currentView
    ? engine.active
    : undefined
  const [addSortOpen, setAddSortOpen] = useState(false)
  const sortRules = props.rules
  const singleSortDirection = sortRules.length === 1
    ? sortRules[0]?.rule.direction
    : undefined
  const availableFields = props.availableFields
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
            if (!currentViewDomain) {
              return
            }

            const id = currentViewDomain.sort.create(fieldId)
            page.query.open({
              kind: 'sort',
              id
            })
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

  if (!sortRules.length) {
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
            items={sortRules}
            getItemId={getSortRuleItemId}
            onMove={(from, to) => {
              if (!currentViewDomain) {
                return
              }

              const movingRule = sortRules[from]?.rule
              if (!movingRule) {
                return
              }

              const remainingRules = sortRules.filter((_, index) => index !== from)
              const beforeId = to >= remainingRules.length
                ? undefined
                : remainingRules[to]?.rule.id
              currentViewDomain.sort.move(movingRule.id, beforeId)
            }}
            renderItem={(entry, drag) => (
              <SortRuleRow
                id={entry.rule.id}
                drag={drag}
                onChange={patch => {
                  currentViewDomain?.sort.patch(entry.rule.id, patch)
                }}
                onRemove={() => {
                  if (!currentViewDomain) {
                    return
                  }

                  const nextRuleId = sortRules.find(rule => rule.rule.id !== entry.rule.id)?.rule.id
                  currentViewDomain.sort.remove(entry.rule.id)

                  if (!nextRuleId) {
                    props.onOpenChange(false)
                    return
                  }

                  page.query.open({
                    kind: 'sort',
                    id: nextRuleId
                  })
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
