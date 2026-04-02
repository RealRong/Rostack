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
  useId,
  useRef,
  useState,
  type PointerEvent
} from 'react'
import type { PropertyId, GroupProperty } from '@dataview/core/contracts'
import { TITLE_PROPERTY_ID } from '@dataview/core/property'
import { getUrlPropertyConfig } from '@dataview/core/property'
import { getSorterPropertyId } from '@dataview/react/page/features/sort'
import { useCurrentView, useEngine, usePageActions } from '@dataview/react/editor'
import { useTableContext } from '../../context'
import { meta, renderMessage } from '@dataview/meta'
import { PropertyKindPicker } from '@dataview/react/properties/schema'
import { Menu, Popover, cn, type MenuItem } from '@dataview/react/ui'
import { useStoreValue } from '@dataview/react/runtime/store'

export interface ColumnHeaderProps {
  property: GroupProperty
  sortId: string
  resizeActive?: boolean
  onResizeStart: (
    propertyId: PropertyId,
    event: PointerEvent<HTMLButtonElement>
  ) => void
}

interface ResizeHandleProps {
  propertyId: PropertyId
  active: boolean
  onResizeStart: (
    propertyId: PropertyId,
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
      props.onResizeStart(props.propertyId, event)
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
  const editor = useEngine()
  const page = usePageActions()
  const [menuOpen, setMenuOpen] = useState(false)
  const pointerStartRef = useRef<{
    x: number
    y: number
  } | null>(null)
  const suppressClickRef = useRef(false)
  const menuScopeId = useId()
  const table = useTableContext()
  const currentView = useCurrentView()
  if (!currentView) {
    throw new Error('Table column header requires an active current view.')
  }

  const view = currentView.view
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
  const isTitleProperty = props.property.id === TITLE_PROPERTY_ID
  const grouped = view.query.group?.property === props.property.id
  const sortDirection = view.query.sorters.find(
    sorter => getSorterPropertyId(sorter) === props.property.id
  )?.direction
  const kind = meta.property.kind.get(props.property.kind)
  const sortDirectionMeta = sortDirection
    ? meta.sort.direction.get(sortDirection)
    : undefined
  const columnRef = useCallback((node: HTMLDivElement | null) => {
    sortable.setNodeRef(node)
    table.nodes.registerColumn(props.property.id, node)
  }, [props.property.id, sortable, table.nodes])
  const urlConfig = props.property.kind === 'url'
    ? getUrlPropertyConfig(props.property)
    : undefined
  const viewApi = editor.view(view.id)

  const insertProperty = (side: 'left' | 'right') => {
    if (side === 'left') {
      viewApi.table.insertColumnLeftOf(props.property.id, {
        kind: 'text'
      })
      return
    }

    viewApi.table.insertColumnRightOf(props.property.id, {
      kind: 'text'
    })
  }

  const items: readonly MenuItem[] = [
    ...(urlConfig
      ? [{
        kind: 'toggle' as const,
        key: 'displayFullUrl',
        label: renderMessage(meta.ui.property.editor.displayFullUrl),
        checked: urlConfig.displayFullUrl,
        indicator: 'switch' as const,
        closeOnSelect: false,
        onSelect: () => {
          editor.properties.update(props.property.id, {
            config: {
              ...urlConfig,
              displayFullUrl: !urlConfig.displayFullUrl
            }
          })
        }
      }]
      : []),
    {
      kind: 'submenu',
      key: 'changeType',
      label: '更改类型',
      leading: <ArrowLeftRight className="size-4" size={16} strokeWidth={1.8} />,
      suffix: renderMessage(kind.message),
      contentClassName: 'w-[240px] p-1.5',
      content: () => (
        <PropertyKindPicker
          kind={props.property.kind}
          isTitleProperty={isTitleProperty}
          onSelect={kind => {
            editor.properties.convert(props.property.id, { kind })
            setMenuOpen(false)
          }}
        />
      )
    },
    ...(!urlConfig
      ? [{
        kind: 'action' as const,
        key: 'editProperty',
        label: '编辑属性',
        leading: <Settings2 className="size-4" size={16} strokeWidth={1.8} />,
        onSelect: () => {
          setMenuOpen(false)
          window.requestAnimationFrame(() => {
            page.settings.open({
              kind: 'propertyEdit',
              propertyId: props.property.id
            })
          })
        }
      }]
      : []),
    {
      kind: 'action',
      key: 'group',
      label: grouped ? '取消分组' : '按此列分组',
      leading: <PanelsTopLeft className="size-4" size={16} strokeWidth={1.8} />,
      onSelect: () => {
        if (grouped) {
          viewApi.grouping.clear()
          return
        }

        viewApi.grouping.setProperty(props.property.id)
      }
    },
    {
      kind: 'action',
      key: 'filter',
      label: '筛选',
      leading: <Filter className="size-4" size={16} strokeWidth={1.8} />,
      onSelect: () => {
        viewApi.filters.add(props.property.id)
        page.query.open({
          kind: 'filter',
          propertyId: props.property.id
        })
      }
    },
    {
      kind: 'submenu',
      key: 'sort',
      label: '排序',
      leading: <ArrowUpDown className="size-4" size={16} strokeWidth={1.8} />,
      suffix: sortDirectionMeta
        ? renderMessage(sortDirectionMeta.message)
        : undefined,
      items: [
        {
          kind: 'toggle',
          key: 'sortAsc',
          label: renderMessage(meta.sort.direction.get('asc').message),
          checked: sortDirection === 'asc',
          onSelect: () => {
            viewApi.sorters.setOnly(props.property.id, 'asc')
          }
        },
        {
          kind: 'toggle',
          key: 'sortDesc',
          label: renderMessage(meta.sort.direction.get('desc').message),
          checked: sortDirection === 'desc',
          onSelect: () => {
            viewApi.sorters.setOnly(props.property.id, 'desc')
          }
        }
      ]
    },
    {
      kind: 'action',
      key: 'hide',
      label: '隐藏',
      leading: <EyeOff className="size-4" size={16} strokeWidth={1.8} />,
      disabled: isTitleProperty,
      onSelect: () => {
        if (isTitleProperty) {
          return
        }

        viewApi.display.hideProperty(props.property.id)
      }
    },
    {
      kind: 'toggle',
      key: 'wrap',
      label: '内容换行显示',
      checked: false,
      disabled: true,
      onSelect: () => undefined
    },
    {
      kind: 'divider',
      key: 'divider-structure'
    },
    {
      kind: 'action',
      key: 'insertLeft',
      label: '在左侧插入',
      onSelect: () => {
        insertProperty('left')
      }
    },
    {
      kind: 'action',
      key: 'insertRight',
      label: '在右侧插入',
      onSelect: () => {
        insertProperty('right')
      }
    },
    {
      kind: 'action',
      key: 'duplicate',
      label: '创建属性副本',
      leading: <Copy className="size-4" size={16} strokeWidth={1.8} />,
      onSelect: () => {
        editor.properties.duplicate(props.property.id)
      }
    },
    {
      kind: 'action',
      key: 'delete',
      label: '删除属性',
      leading: <Trash2 className="size-4" size={16} strokeWidth={1.8} />,
      tone: 'destructive',
      disabled: isTitleProperty,
      onSelect: () => {
        if (isTitleProperty) {
          return
        }

        editor.properties.remove(props.property.id)
      }
    }
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
      <span className="truncate">{props.property.name}</span>
    </div>
  )

  return (
    <div
      ref={node => {
        sortable.setNodeRef(node)
        columnRef(node)
      }}
      data-table-target="column"
      data-column-id={props.property.id}
      className="group/header relative box-border h-full min-w-0"
      style={{
        transform: translate,
        transition: sortable.transition,
        position: 'relative',
        zIndex: isDragging ? 1 : undefined
      }}
    >
      <Popover
        open={menuOpen}
        onOpenChange={setMenuOpen}
        initialFocus={-1}
        scopeId={menuScopeId}
        surface="blocking"
        backdrop="transparent"
        trigger={trigger}
        contentClassName="min-w-0 w-[280px] p-1"
      >
        <Menu
          items={items}
          onClose={() => setMenuOpen(false)}
          scopeId={menuScopeId}
        />
      </Popover>
      <ResizeHandle
        propertyId={props.property.id}
        active={Boolean(props.resizeActive)}
        onResizeStart={props.onResizeStart}
      />
    </div>
  )
}
