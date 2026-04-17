import {
  type CardLayout,
  type CardSize,
  KANBAN_CARDS_PER_COLUMN_OPTIONS,
  type KanbanCardsPerColumn,
  type ViewType
} from '@dataview/core/contracts'
import { getDocumentFields } from '@dataview/core/document'
import { useDataView, useDataViewValue } from '@dataview/react/dataview'
import { meta } from '@dataview/meta'
import { buildChoiceSubmenuItem } from '@dataview/react/menu-builders'
import { usesOptionGroupingColors } from '@dataview/react/views/shared/optionGrouping'
import { Menu, type MenuItem } from '@shared/ui/menu'
import { cn } from '@shared/ui/utils'
import { useTranslation } from '@shared/i18n/react'

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

const CARD_SIZE_OPTIONS = ['sm', 'md', 'lg'] as const satisfies readonly CardSize[]
const CARD_LAYOUT_OPTIONS = ['compact', 'stacked'] as const satisfies readonly CardLayout[]

const LayoutTypeCard = (props: {
  type: (typeof SUPPORTED_LAYOUT_TYPES)[number]
  selected: boolean
  onClick: () => void
}) => {
  const { t } = useTranslation()
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
        {t(meta.ui.viewSettings.layoutPanel.viewTypeOption(props.type))}
      </span>
    </button>
  )
}

export const LayoutPanel = () => {
  const { t } = useTranslation()
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
    label: t(meta.ui.viewSettings.layoutPanel.cardsPerColumnOption(value))
  }))
  const cardSizeOptions = CARD_SIZE_OPTIONS.map(value => ({
    value,
    label: t(meta.ui.viewSettings.layoutPanel.cardSizeOption(value))
  }))
  const cardLayoutOptions = CARD_LAYOUT_OPTIONS.map(value => ({
    value,
    label: t(meta.ui.viewSettings.layoutPanel.cardLayoutOption(value))
  }))

  if (!view || !viewApi) {
    return <div className="min-h-0 flex-1 overflow-y-auto" />
  }

  const tableItems: readonly MenuItem[] = view.type === 'table'
    ? [
        {
          kind: 'toggle',
          key: 'showVerticalLines',
          label: t(meta.ui.viewSettings.layoutPanel.showVerticalLines),
          checked: view.options.table.showVerticalLines,
          indicator: 'switch',
          onSelect: () => {
            viewApi.table.setVerticalLines(!view.options.table.showVerticalLines)
          }
        },
        {
          kind: 'toggle',
          key: 'wrap',
          label: t(meta.ui.viewSettings.layoutPanel.wrap),
          checked: view.options.table.wrap,
          indicator: 'switch',
          onSelect: () => {
            viewApi.table.setWrap(!view.options.table.wrap)
          }
        }
      ]
    : []

  const cardItems: readonly MenuItem[] = view.type === 'gallery' || view.type === 'kanban'
    ? [
        {
          kind: 'toggle',
          key: 'wrap',
          label: t(meta.ui.viewSettings.layoutPanel.wrap),
          checked: view.type === 'gallery'
            ? view.options.gallery.card.wrap
            : view.options.kanban.card.wrap,
          indicator: 'switch',
          onSelect: () => {
            if (view.type === 'gallery') {
              viewApi.gallery.setWrap(!view.options.gallery.card.wrap)
              return
            }

            viewApi.kanban.setWrap(!view.options.kanban.card.wrap)
          }
        },
        buildChoiceSubmenuItem({
          key: 'size',
          label: t(meta.ui.viewSettings.layoutPanel.cardSize),
          suffix: t(meta.ui.viewSettings.layoutPanel.cardSizeOption(
            view.type === 'gallery'
              ? view.options.gallery.card.size
              : view.options.kanban.card.size
          )),
          value: view.type === 'gallery'
            ? view.options.gallery.card.size
            : view.options.kanban.card.size,
          options: cardSizeOptions.map(option => ({
            id: option.value,
            label: option.label
          })),
          onSelect: value => {
            const size = value as CardSize
            if (view.type === 'gallery') {
              viewApi.gallery.setSize(size)
              return
            }

            viewApi.kanban.setSize(size)
          },
          presentation: 'dropdown',
          placement: 'bottom-end'
        }),
        buildChoiceSubmenuItem({
          key: 'layout',
          label: t(meta.ui.viewSettings.layoutPanel.cardLayout),
          suffix: t(meta.ui.viewSettings.layoutPanel.cardLayoutOption(
            view.type === 'gallery'
              ? view.options.gallery.card.layout
              : view.options.kanban.card.layout
          )),
          value: view.type === 'gallery'
            ? view.options.gallery.card.layout
            : view.options.kanban.card.layout,
          options: cardLayoutOptions.map(option => ({
            id: option.value,
            label: option.label
          })),
          onSelect: value => {
            const layout = value as CardLayout
            if (view.type === 'gallery') {
              viewApi.gallery.setLayout(layout)
              return
            }

            viewApi.kanban.setLayout(layout)
          },
          presentation: 'dropdown',
          placement: 'bottom-end'
        })
      ]
    : []

  const kanbanItems: readonly MenuItem[] = view.type === 'kanban'
    ? [
        buildChoiceSubmenuItem({
          key: 'cardsPerColumn',
          label: t(meta.ui.viewSettings.layoutPanel.cardsPerColumn),
          suffix: t(
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
          label: t(meta.ui.viewSettings.layoutPanel.fillColumnColor),
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
          <Menu
            items={tableItems}
            autoFocus={false}
            submenuOpenPolicy="click"
          />
        </div>
      ) : null}

      {view.type === 'gallery' || view.type === 'kanban' ? (
        <div className="mt-3">
          <Menu
            items={cardItems}
            autoFocus={false}
            submenuOpenPolicy="click"
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
