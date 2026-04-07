import {
  ArrowLeftRight,
  ArrowUpDown,
  Copy,
  EyeOff,
  Filter,
  PanelsTopLeft,
  Settings2,
  Trash2
} from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import {
  useCallback,
  useRef,
  useState,
  type PointerEvent
} from 'react'
import type { Field, FieldId, CustomField } from '@dataview/core/contracts'
import { Menu, type MenuItem } from '@ui/menu'
import { cn } from '@ui/utils'
import { isCustomField } from '@dataview/core/field'
import { getSorterFieldId } from '@dataview/react/page/features/sort'
import { useCurrentView, useDataView } from '@dataview/react/dataview'
import { useTableContext } from '../../context'
import { meta, renderMessage } from '@dataview/meta'
import { buildFieldKindMenuItems } from '@dataview/react/field/schema'
import { useStoreValue } from '@dataview/react/store'

export interface ColumnHeaderProps {
  field: Field
  sortId: string
  resizeActive?: boolean
  onResizeStart: (
    fieldId: FieldId,
    event: PointerEvent<HTMLButtonElement>
  ) => void
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
  const currentView = useCurrentView()
  if (!currentView) {
    throw new Error('Table column header requires an active current view.')
  }

  const view = currentView.view
  const showVerticalLines = view.options.table.showVerticalLines
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
  const grouped = view.query.group?.field === props.field.id
  const sortDirection = view.query.sorters.find(
    sorter => getSorterFieldId(sorter) === props.field.id
  )?.direction
  const kind = meta.field.kind.get(props.field.kind)
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
  const viewApi = editor.view(view.id)

  const insertProperty = (side: 'left' | 'right') => {
    if (side === 'left') {
      viewApi.table.insertColumnLeftOf(props.field.id, {
        kind: 'text'
      })
      return
    }

    viewApi.table.insertColumnRightOf(props.field.id, {
      kind: 'text'
    })
  }

  const items: readonly MenuItem[] = [
    ...(urlConfig
      ? [{
        kind: 'toggle' as const,
        key: 'displayFullUrl',
        label: renderMessage(meta.ui.field.editor.displayFullUrl),
        checked: urlConfig.displayFullUrl,
        indicator: 'switch' as const,
        closeOnSelect: false,
        onSelect: () => {
          editor.fields.update(urlConfig.id, {
            displayFullUrl: !urlConfig.displayFullUrl
          } as Partial<Omit<CustomField, 'id'>>)
        }
      }]
      : []),
    ...(customField
      ? [{
        kind: 'submenu' as const,
        key: 'changeType',
        label: '更改类型',
        leading: <ArrowLeftRight className="size-4" size={16} strokeWidth={1.8} />,
        suffix: renderMessage(kind.message),
        size: 'lg' as const,
        items: buildFieldKindMenuItems({
          kind: customField.kind,
          isTitleProperty: false,
          onSelect: kind => {
            editor.fields.convert(customField.id, { kind })
            setMenuOpen(false)
          }
        })
      }]
      : []),
    ...(!urlConfig && customField
      ? [{
        kind: 'action' as const,
        key: 'editProperty',
        label: '编辑属性',
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
      : []),
    {
      kind: 'action' as const,
      key: 'group',
      label: grouped ? '取消分组' : '按此列分组',
      leading: <PanelsTopLeft className="size-4" size={16} strokeWidth={1.8} />,
      onSelect: () => {
        if (grouped) {
          viewApi.grouping.clear()
          return
        }

        viewApi.grouping.setField(props.field.id)
      }
    },
    {
      kind: 'action' as const,
      key: 'filter',
      label: '筛选',
      leading: <Filter className="size-4" size={16} strokeWidth={1.8} />,
      onSelect: () => {
        viewApi.filters.add(props.field.id)
        page.query.open({
          kind: 'filter',
          fieldId: props.field.id
        })
      }
    },
    {
      kind: 'submenu' as const,
      key: 'sort',
      label: '排序',
      leading: <ArrowUpDown className="size-4" size={16} strokeWidth={1.8} />,
      suffix: sortDirectionMeta
        ? renderMessage(sortDirectionMeta.message)
        : undefined,
      items: [
        {
          kind: 'toggle' as const,
          key: 'sortAsc',
          label: renderMessage(meta.sort.direction.get('asc').message),
          checked: sortDirection === 'asc',
          onSelect: () => {
            viewApi.sorters.setOnly(props.field.id, 'asc')
          }
        },
        {
          kind: 'toggle' as const,
          key: 'sortDesc',
          label: renderMessage(meta.sort.direction.get('desc').message),
          checked: sortDirection === 'desc',
          onSelect: () => {
            viewApi.sorters.setOnly(props.field.id, 'desc')
          }
        }
      ]
    },
    {
      kind: 'action' as const,
      key: 'hide',
      label: '隐藏',
      leading: <EyeOff className="size-4" size={16} strokeWidth={1.8} />,
      disabled: false,
      onSelect: () => {
        viewApi.display.hideField(props.field.id)
      }
    },
    {
      kind: 'toggle' as const,
      key: 'wrap',
      label: '内容换行显示',
      checked: false,
      disabled: true,
      onSelect: () => undefined
    },
    {
      kind: 'divider' as const,
      key: 'divider-structure'
    },
    {
      kind: 'action' as const,
      key: 'insertLeft',
      label: '在左侧插入',
      onSelect: () => {
        insertProperty('left')
      }
    },
    {
      kind: 'action' as const,
      key: 'insertRight',
      label: '在右侧插入',
      onSelect: () => {
        insertProperty('right')
      }
    },
    ...(customField
      ? [{
          kind: 'action' as const,
          key: 'duplicate',
          label: '创建属性副本',
          leading: <Copy className="size-4" size={16} strokeWidth={1.8} />,
          onSelect: () => {
            editor.fields.duplicate(customField.id)
          }
        }, {
          kind: 'action' as const,
          key: 'delete',
          label: '删除属性',
          leading: <Trash2 className="size-4" size={16} strokeWidth={1.8} />,
          tone: 'destructive' as const,
          disabled: false,
          onSelect: () => {
            editor.fields.remove(customField.id)
          }
        }]
      : [])
  ]

  const trigger = (
    <div
      {...sortable.attributes}
      {...sortable.listeners}
      className={cn(
        'flex h-full min-w-0 items-center gap-1 px-2 text-sm font-semibold transition-colors hover:bg-muted/80',
        isDragging && 'z-10 cursor-grabbing bg-muted/80'
      )}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        touchAction: 'none'
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
      <span className="truncate">{props.field.name}</span>
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
