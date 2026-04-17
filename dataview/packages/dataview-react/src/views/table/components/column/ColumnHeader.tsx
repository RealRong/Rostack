import {
  ArrowLeftRight,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpDown,
  Copy,
  EyeOff,
  Filter,
  PanelsTopLeft,
  Settings2,
  Sigma,
  TextWrap,
  Trash2
} from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent
} from 'react'
import type { CalculationMetric, Field, FieldId, CustomField } from '@dataview/core/contracts'
import {
  Menu,
  type MenuItem,
  type MenuSubmenuItem,
  type MenuToggleItem
} from '@shared/ui/menu'
import { cn } from '@shared/ui/utils'
import { isCustomField } from '@dataview/core/field'
import { getFieldCalculationMetrics } from '@dataview/core/calculation'
import { getSorterFieldId } from '@dataview/react/page/features/query/fields'
import {
  useDataView,
} from '@dataview/react/dataview'
import { useStoreValue } from '@shared/react'
import { token, type Token, type TokenTranslator } from '@shared/i18n'
import { useTranslation } from '@shared/i18n/react'
import { useTableContext } from '@dataview/react/views/table/context'
import { meta } from '@dataview/meta'
import { buildFieldKindMenuItems } from '@dataview/react/field/schema'
import {
  TABLE_CELL_INLINE_PADDING,
  TABLE_HEADER_BLOCK_PADDING
} from '@dataview/react/views/table/layout'

export interface ColumnHeaderProps {
  field: Field
  sortId: string
  wrapCells: boolean
  resizeActive?: boolean
  onResizeStart: (
    fieldId: FieldId,
    event: PointerEvent<HTMLButtonElement>
  ) => void
}

const CALCULATION_MENU_GROUPS = [
  {
    key: 'counts',
    label: token('meta.calculation.group.counts', 'Counts'),
    metrics: [
      'countAll',
      'countValues',
      'countUniqueValues',
      'countEmpty',
      'countNonEmpty'
    ]
  },
  {
    key: 'percentages',
    label: token('meta.calculation.group.percentages', 'Percentages'),
    metrics: [
      'percentEmpty',
      'percentNonEmpty'
    ]
  },
  {
    key: 'options',
    label: token('meta.calculation.group.options', 'By option'),
    metrics: [
      'countByOption',
      'percentByOption'
    ]
  },
  {
    key: 'advanced',
    label: token('meta.calculation.group.advanced', 'More'),
    metrics: [
      'sum',
      'average',
      'median',
      'min',
      'max',
      'range'
    ]
  }
] as const satisfies readonly {
  key: string
  label: Token
  metrics: readonly CalculationMetric[]
}[]

const buildCalculationMetricItems = (input: {
  t: TokenTranslator
  metrics: readonly CalculationMetric[]
  currentMetric?: CalculationMetric
  onSelectMetric: (metric: CalculationMetric) => void
}): readonly MenuToggleItem[] => input.metrics.map(metric => ({
  kind: 'toggle',
  key: `calculation:${metric}`,
  label: input.t(meta.calculation.metric.get(metric).token),
  checked: input.currentMetric === metric,
  onSelect: () => {
    input.onSelectMetric(metric)
  }
}))

const buildCalculationMenuItems = (input: {
  t: TokenTranslator
  metrics: readonly CalculationMetric[]
  currentMetric?: CalculationMetric
  onClear: () => void
  onSelectMetric: (metric: CalculationMetric) => void
}): readonly MenuItem[] => {
  const availableMetrics = new Set<CalculationMetric>(input.metrics)
  const groupItems = CALCULATION_MENU_GROUPS.flatMap<MenuSubmenuItem>(group => {
    const metrics = group.metrics.filter(metric => availableMetrics.has(metric))
    if (!metrics.length) {
      return []
    }

    return [{
      kind: 'submenu',
      key: `calculation-group:${group.key}`,
      label: input.t(group.label),
      items: buildCalculationMetricItems({
        t: input.t,
        metrics,
        currentMetric: input.currentMetric,
        onSelectMetric: input.onSelectMetric
      })
    }]
  })

  return [
    {
      kind: 'toggle',
      key: 'calculation:none',
      label: input.t(token('meta.calculation.none', 'None')),
      checked: !input.currentMetric,
      onSelect: input.onClear
    },
    ...groupItems
  ]
}

interface ResizeHandleProps {
  fieldId: FieldId
  active: boolean
  onResizeStart: (
    fieldId: FieldId,
    event: PointerEvent<HTMLButtonElement>
  ) => void
}

const ResizeHandle = (props: ResizeHandleProps) => (
  <button
    type="button"
    tabIndex={-1}
    aria-hidden="true"
    className="group/resize absolute inset-y-0 right-0 z-20 w-[10px] translate-x-1/2 cursor-col-resize touch-none select-none"
    onPointerDown={event => {
      event.preventDefault()
      event.stopPropagation()
      props.onResizeStart(props.fieldId, event)
    }}
  >
    <span
      className={cn(
        'absolute inset-y-0 left-1/2 w-[5px] -translate-x-1/2 transition-opacity',
        props.active
          ? 'bg-primary opacity-100'
          : 'bg-primary opacity-0 group-hover/resize:opacity-100'
      )}
    />
  </button>
)

export const ColumnHeader = (props: ColumnHeaderProps) => {
  const { t } = useTranslation()
  const dataView = useDataView()
  const editor = dataView.engine
  const page = dataView.page
  const [menuOpen, setMenuOpen] = useState(false)
  const pointerStartRef = useRef<{
    x: number
    y: number
  } | null>(null)
  const suppressClickRef = useRef(false)
  const table = useTableContext()
  const currentView = useStoreValue(table.currentView)
  if (!currentView) {
    throw new Error('Table column header requires an active current view.')
  }

  const view = currentView.view
  const groupProjection = currentView.query.group
  const sortProjection = currentView.query.sort
  const showVerticalLinesStore = useMemo(() => editor.active.select(
    state => state?.view.options.table.showVerticalLines ?? false
  ), [editor])
  const showVerticalLines = useStoreValue(showVerticalLinesStore)
  const sortable = useSortable({
    id: props.sortId,
    transition: {
      duration: 160,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
    }
  })
  const translate = sortable.transform
    ? `translate3d(${Math.round(sortable.transform.x)}px, 0, 0)`
    : undefined
  const isDragging = sortable.isDragging
  const grouped = groupProjection?.active === true
    && groupProjection.fieldId === props.field.id
  const sortDirection = sortProjection?.rules.find(
    entry => getSorterFieldId(entry.sorter) === props.field.id
  )?.sorter.direction
  const wrapCells = props.wrapCells
  const calculationMetric = view.calc[props.field.id] as CalculationMetric | undefined
  const calculationMetrics = getFieldCalculationMetrics(props.field)
  const kind = meta.field.kind.get(props.field.kind)
  const KindIcon = kind.Icon
  const sortDirectionMeta = sortDirection
    ? meta.sort.direction.get(sortDirection)
    : undefined
  const columnRef = useCallback((node: HTMLDivElement | null) => {
    sortable.setNodeRef(node)
    table.nodes.registerColumn(props.field.id, node)
  }, [props.field.id, sortable, table.nodes])
  const customField = isCustomField(props.field)
    ? props.field
    : undefined
  const urlConfig = customField?.kind === 'url'
    ? customField
    : undefined
  const viewApi = editor.active

  const insertProperty = (side: 'left' | 'right') => {
    const name = t(meta.field.kind.get('text').defaultName)
    if (side === 'left') {
      viewApi.table.insertFieldLeft(props.field.id, {
        kind: 'text',
        name
      })
      return
    }

    viewApi.table.insertFieldRight(props.field.id, {
      kind: 'text',
      name
    })
  }

  const urlItems: readonly MenuItem[] = urlConfig
    ? [{
      kind: 'toggle',
      key: 'displayFullUrl',
      label: t(meta.ui.field.editor.displayFullUrl),
      checked: urlConfig.displayFullUrl,
      indicator: 'switch',
      closeOnSelect: false,
      onSelect: () => {
        editor.fields.update(urlConfig.id, {
          displayFullUrl: !urlConfig.displayFullUrl
        } as Partial<Omit<CustomField, 'id'>>)
      }
    }]
    : []
  const changeTypeItems: readonly MenuItem[] = customField
    ? [{
      kind: 'submenu',
      key: 'changeType',
      label: t(token('dataview.react.table.column.changeType', 'Change type')),
      leading: <ArrowLeftRight className="size-4" size={16} strokeWidth={1.8} />,
      suffix: t(kind.token),
      size: 'lg',
      items: buildFieldKindMenuItems({
        t,
        kind: customField.kind,
        isTitleProperty: false,
        onSelect: kind => {
          editor.fields.changeType(customField.id, { kind })
          setMenuOpen(false)
        }
      })
    }]
    : []
  const editItems: readonly MenuItem[] = !urlConfig && customField
    ? [{
      kind: 'action',
      key: 'editProperty',
      label: t(token('dataview.react.table.column.editProperty', 'Edit field')),
      leading: <Settings2 className="size-4" size={16} strokeWidth={1.8} />,
      onSelect: () => {
        setMenuOpen(false)
        window.requestAnimationFrame(() => {
          page.settings.open({
            kind: 'fieldSchema',
            fieldId: customField.id
          })
        })
      }
    }]
    : []
  const customFieldItems: readonly MenuItem[] = customField
    ? [{
      kind: 'action',
      key: 'duplicate',
      label: t(token('dataview.react.table.column.duplicateField', 'Duplicate field')),
      leading: <Copy className="size-4" size={16} strokeWidth={1.8} />,
      onSelect: () => {
        editor.fields.duplicate(customField.id)
      }
    }, {
      kind: 'action',
      key: 'delete',
      label: t(token('dataview.react.table.column.deleteField', 'Delete field')),
      leading: <Trash2 className="size-4" size={16} strokeWidth={1.8} />,
      tone: 'destructive',
      disabled: false,
      onSelect: () => {
        editor.fields.remove(customField.id)
      }
    }]
    : []
  const items: readonly MenuItem[] = [
    ...urlItems,
    ...changeTypeItems,
    ...editItems,
    {
      kind: 'action',
      key: 'group',
      label: grouped
        ? t(token('dataview.react.table.column.ungroup', 'Ungroup by this field'))
        : t(token('dataview.react.table.column.group', 'Group by this field')),
      leading: <PanelsTopLeft className="size-4" size={16} strokeWidth={1.8} />,
      onSelect: () => {
        if (grouped) {
          viewApi.group.clear()
          return
        }

        viewApi.group.set(props.field.id)
      }
    },
    {
      kind: 'action',
      key: 'filter',
      label: t(meta.ui.filter.label),
      leading: <Filter className="size-4" size={16} strokeWidth={1.8} />,
      onSelect: () => {
        viewApi.filters.add(props.field.id)
        page.query.open({
          kind: 'filter',
          index: currentView.query.filters.rules.length
        })
      }
    },
    {
      kind: 'submenu',
      key: 'sort',
      label: t(meta.ui.sort.label),
      leading: <ArrowUpDown className="size-4" size={16} strokeWidth={1.8} />,
      suffix: sortDirectionMeta
        ? t(sortDirectionMeta.token)
        : undefined,
      items: [
        {
          kind: 'toggle',
          key: 'sortAsc',
          label: t(meta.sort.direction.get('asc').token),
          checked: sortDirection === 'asc',
          onSelect: () => {
            viewApi.sort.keepOnly(props.field.id, 'asc')
          }
        },
        {
          kind: 'toggle',
          key: 'sortDesc',
          label: t(meta.sort.direction.get('desc').token),
          checked: sortDirection === 'desc',
          onSelect: () => {
            viewApi.sort.keepOnly(props.field.id, 'desc')
          }
        }
      ]
    },
    {
      kind: 'submenu',
      key: 'calculation',
      label: t(token('dataview.react.table.column.calculation', 'Calculation')),
      leading: <Sigma className="size-4" size={16} strokeWidth={1.8} />,
      suffix: calculationMetric
        ? t(meta.calculation.metric.get(calculationMetric).token)
        : t(token('meta.calculation.none', 'None')),
      items: buildCalculationMenuItems({
        t,
        metrics: calculationMetrics,
        currentMetric: calculationMetric,
        onClear: () => {
          viewApi.summary.set(props.field.id, null)
        },
        onSelectMetric: metric => {
          viewApi.summary.set(props.field.id, metric)
        }
      })
    },
    {
      kind: 'action',
      key: 'hide',
      label: t(token('dataview.react.table.column.hide', 'Hide')),
      leading: <EyeOff className="size-4" size={16} strokeWidth={1.8} />,
      disabled: false,
      onSelect: () => {
        viewApi.display.hide(props.field.id)
      }
    },
    {
      kind: 'toggle',
      key: 'wrap',
      label: t(meta.ui.viewSettings.layoutPanel.wrapCells),
      checked: wrapCells,
      leading: <TextWrap className="size-4" size={16} strokeWidth={1.8} />,
      onSelect: () => {
        viewApi.table.setWrapCells(!wrapCells)
      }
    },
    {
      kind: 'divider',
      key: 'divider-structure'
    },
    {
      kind: 'action',
      leading: <ArrowLeftToLine className="size-4" size={16} strokeWidth={1.8} />,
      key: 'insertLeft',
      label: t(token('dataview.react.table.column.insertLeft', 'Insert left')),
      onSelect: () => {
        insertProperty('left')
      }
    },
    {
      kind: 'action',
      key: 'insertRight',
      leading: <ArrowRightToLine className="size-4" size={16} strokeWidth={1.8} />,
      label: t(token('dataview.react.table.column.insertRight', 'Insert right')),
      onSelect: () => {
        insertProperty('right')
      }
    },
    ...customFieldItems
  ]

  const trigger = (
    <div
      {...sortable.attributes}
      {...sortable.listeners}
      className={cn(
        'flex h-full min-w-0 items-center gap-1.5 text-sm font-semibold transition-colors hover:bg-muted/80',
        isDragging && 'z-10 cursor-grabbing bg-muted/80'
      )}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        touchAction: 'none',
        paddingInline: TABLE_CELL_INLINE_PADDING,
        paddingBlock: TABLE_HEADER_BLOCK_PADDING
      }}
      onPointerDownCapture={event => {
        if (event.button !== 0) {
          return
        }

        pointerStartRef.current = {
          x: event.clientX,
          y: event.clientY
        }
        suppressClickRef.current = false
      }}
      onPointerMoveCapture={event => {
        const start = pointerStartRef.current
        if (!start) {
          return
        }

        const dx = Math.abs(event.clientX - start.x)
        const dy = Math.abs(event.clientY - start.y)
        if (dx >= 6 || dy >= 6) {
          suppressClickRef.current = true
        }
      }}
      onPointerCancelCapture={() => {
        pointerStartRef.current = null
        suppressClickRef.current = false
      }}
      onClickCapture={event => {
        pointerStartRef.current = null

        if (!suppressClickRef.current && !isDragging) {
          return
        }

        suppressClickRef.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <span className="inline-flex shrink-0 items-center justify-center text-muted-foreground">
        <KindIcon className="size-4 shrink-0" size={16} strokeWidth={1.8} />
      </span>

      <span
        className={cn(
          'block min-w-0 flex-1',
          wrapCells
            ? 'whitespace-normal break-words [overflow-wrap:anywhere]'
            : 'truncate'
        )}
      >
        {props.field.name}
      </span>
    </div>
  )

  return (
    <div
      ref={node => {
        sortable.setNodeRef(node)
        columnRef(node)
      }}
      data-table-target="column"
      data-column-id={props.field.id}
      className={cn(
        'group/header relative box-border h-full min-w-0',
        showVerticalLines && 'border-r border-divider'
      )}
      style={{
        transform: translate,
        transition: sortable.transition,
        position: 'relative',
        zIndex: isDragging ? 1 : undefined
      }}
    >
      <Menu.Dropdown
        open={menuOpen}
        onOpenChange={setMenuOpen}
        initialFocus={-1}
        mode="blocking"
        backdrop="transparent"
        items={items}
        size="xl"
        trigger={trigger}
      />
      <ResizeHandle
        fieldId={props.field.id}
        active={Boolean(props.resizeActive)}
        onResizeStart={props.onResizeStart}
      />
    </div>
  )
}
