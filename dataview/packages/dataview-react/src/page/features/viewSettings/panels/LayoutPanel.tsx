import {
  KANBAN_CARDS_PER_COLUMN_OPTIONS,
  type KanbanCardsPerColumn,
  type ViewType
} from '@dataview/core/contracts'
import { getDocumentFields } from '@dataview/core/document'
import { useDataView, useDataViewValue } from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import { buildChoiceSubmenuItem } from '@dataview/react/menu-builders'
import { usesOptionGroupingColors } from '@dataview/react/views/shared/optionGrouping'
import { Menu, type MenuItem } from '@shared/ui/menu'
import { Switch } from '@shared/ui/switch'
import { cn } from '@shared/ui/utils'

const SUPPORTED_LAYOUT_TYPES = ['table', 'kanban', 'gallery'] as const satisfies readonly ViewType[]

const parseCardsPerColumn = (
  value: string
): KanbanCardsPerColumn => {
  switch (value) {
    case '25':
      return 25
    case '50':
      return 50
    case '100':
      return 100
    case 'all':
    default:
      return 'all'
  }
}

const LayoutTypeCard = (props: {
  type: (typeof SUPPORTED_LAYOUT_TYPES)[number]
  selected: boolean
  onClick: () => void
}) => {
  const descriptor = meta.view.get(props.type)
  const Icon = descriptor.Icon

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        'flex h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border bg-surface px-3 text-center text-fg-muted transition-colors',
        props.selected
          ? 'border-primary text-accent'
          : 'hover:bg-hover hover:text-fg'
      )}
    >
      <Icon className="size-5 shrink-0" size={18} strokeWidth={1.8} />
      <span className="truncate text-xs font-medium">
        {renderMessage(meta.ui.viewSettings.layoutPanel.viewTypeOption(props.type))}
      </span>
    </button>
  )
}

const LayoutSwitchRow = (props: {
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) => (
  <div className="flex items-start gap-3">
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium text-foreground">
        {props.label}
      </div>
      {props.description ? (
        <div className="mt-0.5 text-xs text-muted-foreground">
          {props.description}
        </div>
      ) : null}
    </div>
    <Switch
      checked={props.checked}
      onCheckedChange={props.onCheckedChange}
      disabled={props.disabled}
      aria-label={props.label}
      className="mt-0.5"
    />
  </div>
)

export const LayoutPanel = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const document = useDataViewValue(dataView => dataView.engine.select.document)
  const view = useDataViewValue(dataView => dataView.engine.active.config)
  const viewApi = view
    ? engine.active
    : undefined
  const fieldMap = new Map(getDocumentFields(document).map(field => [field.id, field] as const))
  const groupField = view?.group?.field
    ? fieldMap.get(view.group.field)
    : undefined
  const canFillKanbanColumns = usesOptionGroupingColors(groupField)
  const cardsPerColumnOptions = KANBAN_CARDS_PER_COLUMN_OPTIONS.map(value => ({
    value: String(value),
    label: renderMessage(meta.ui.viewSettings.layoutPanel.cardsPerColumnOption(value))
  }))

  if (!view || !viewApi) {
    return <div className="min-h-0 flex-1 overflow-y-auto" />
  }

  const kanbanItems: readonly MenuItem[] = view.type === 'kanban'
    ? [
        buildChoiceSubmenuItem({
          key: 'cardsPerColumn',
          label: renderMessage(meta.ui.viewSettings.layoutPanel.cardsPerColumn),
          suffix: renderMessage(
            meta.ui.viewSettings.layoutPanel.cardsPerColumnOption(
              view.options.kanban.cardsPerColumn
            )
          ),
          value: String(view.options.kanban.cardsPerColumn),
          options: cardsPerColumnOptions.map(option => ({
            id: option.value,
            label: option.label
          })),
          onSelect: value => {
            viewApi.kanban.setCardsPerColumn(
              parseCardsPerColumn(value)
            )
          },
          presentation: 'dropdown',
          placement: 'bottom-end'
        }),
        {
          kind: 'toggle',
          key: 'fillColumnColor',
          label: renderMessage(meta.ui.viewSettings.layoutPanel.fillColumnColor),
          checked: view.options.kanban.fillColumnColor,
          disabled: !canFillKanbanColumns,
          indicator: 'switch',
          onSelect: () => {
            viewApi.kanban.setFillColor(!view.options.kanban.fillColumnColor)
          }
        }
      ]
    : []

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <div className="grid grid-cols-3 gap-2">
        {SUPPORTED_LAYOUT_TYPES.map(type => (
          <LayoutTypeCard
            key={type}
            type={type}
            selected={view.type === type}
            onClick={() => {
              if (view.type === type) {
                return
              }

              viewApi.changeType(type)
            }}
          />
        ))}
      </div>

      {view.type === 'table' ? (
        <div className="mt-3">
          <LayoutSwitchRow
            label={renderMessage(meta.ui.viewSettings.layoutPanel.showVerticalLines)}
            checked={view.options.table.showVerticalLines}
            onCheckedChange={checked => {
              viewApi.table.setVerticalLines(checked)
            }}
          />
        </div>
      ) : null}

      {view.type === 'kanban' ? (
        <div className="mt-3">
          <Menu
            items={kanbanItems}
            autoFocus={false}
            submenuOpenPolicy="click"
          />
        </div>
      ) : null}
    </div>
  )
}
