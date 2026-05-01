import {
  Copy,
  Settings2,
  SquarePen,
  Trash2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  View,
  ViewId
} from '@dataview/core/types'
import { Menu, type MenuItem } from '@shared/ui/menu'
import { cn } from '@shared/ui/utils'
import { CreateViewPopover } from '@dataview/react/page/features/createView'
import {
  useDataView,
  usePageModel
} from '@dataview/react/dataview'
import { meta } from '@dataview/meta'
import { token } from '@shared/i18n'
import { useTranslation } from '@shared/i18n/react'
import {
  useStoreValue
} from '@shared/react'

interface ViewTabProps {
  view: View
  active: boolean
  onClick: () => void
  menuOpen: boolean
  canRemove: boolean
  onOpenMenu: () => void
  onCloseMenu: () => void
  onRename: () => void
  onEdit: () => void
  onDuplicate: () => void
  onRemove: () => void
}

const ViewTab = (props: ViewTabProps) => {
  const { t } = useTranslation()
  const viewType = meta.view.get(props.view.type)
  const Icon = viewType.Icon
  const items: readonly MenuItem[] = [
    {
      kind: 'action',
      key: 'rename',
      label: t(token('dataview.react.toolbar.view.rename', 'Rename')),
      leading: <SquarePen className="size-4" size={16} strokeWidth={1.8} />,
      onSelect: props.onRename
    },
    {
      kind: 'action',
      key: 'edit',
      label: t(meta.ui.toolbar.settings(props.view.type)),
      leading: <Settings2 className="size-4" size={16} strokeWidth={1.8} />,
      onSelect: props.onEdit
    },
    {
      kind: 'divider',
      key: 'divider-actions'
    },
    {
      kind: 'action',
      key: 'duplicate',
      label: t(meta.ui.viewSettings.duplicate),
      leading: <Copy className="size-4" size={16} strokeWidth={1.8} />,
      onSelect: props.onDuplicate
    },
    {
      kind: 'action',
      key: 'remove',
      label: t(meta.ui.viewSettings.remove),
      leading: <Trash2 className="size-4" size={16} strokeWidth={1.8} />,
      tone: 'destructive',
      disabled: !props.canRemove,
      onSelect: props.onRemove
    }
  ]

  return (
    <div className="relative shrink-0">
      <Menu.Dropdown
        open={props.menuOpen}
        onOpenChange={open => {
          if (open) {
            props.onOpenMenu()
            return
          }

          props.onCloseMenu()
        }}
        initialFocus={0}
        placement="bottom-start"
        mode="blocking"
        backdrop="transparent"
        items={items}
        autoFocus={false}
        size="md"
        trigger={(
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
          />
        )}
      />
      <button
        type="button"
        onClick={props.onClick}
        onContextMenu={event => {
          event.preventDefault()
          event.stopPropagation()
          props.onOpenMenu()
        }}
        className={cn(
          'inline-flex h-8 shrink-0 select-none text-sm items-center gap-2 rounded-3xl bg-transparent px-3 font-semibold text-fg-muted transition-[background-color,color] hover:bg-hover hover:text-fg',
          props.active && 'bg-pressed text-fg hover:bg-pressed'
        )}
      >
        <Icon className="shrink-0" size={16} strokeWidth={1.5} />
        <span className="truncate">{props.view.name}</span>
      </button>
    </div>
  )
}

export const ToolbarTabs = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const page = dataView.session.page
  const pageModel = usePageModel()
  const toolbar = useStoreValue(pageModel.toolbar)
  const currentViewId = toolbar.viewId
  const views = toolbar.views
  const [tabMenuViewId, setTabMenuViewId] = useState<ViewId | null>(null)

  useEffect(() => {
    if (tabMenuViewId && !views.some(view => view.id === tabMenuViewId)) {
      setTabMenuViewId(null)
    }
  }, [tabMenuViewId, views])

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pr-2">
      {views.map(view => (
        <ViewTab
          key={view.id}
          view={view}
          active={view.id === currentViewId}
          menuOpen={tabMenuViewId === view.id}
          canRemove={views.length > 1}
          onClick={() => engine.views.open(view.id)}
          onOpenMenu={() => setTabMenuViewId(view.id)}
          onCloseMenu={() => {
            setTabMenuViewId(current => (
              current === view.id
                ? null
                : current
            ))
          }}
          onRename={() => {
            setTabMenuViewId(null)
            engine.views.open(view.id)
            page.settings.open({
              kind: 'root',
              focusTarget: 'viewName'
            })
          }}
          onEdit={() => {
            setTabMenuViewId(null)
            engine.views.open(view.id)
            page.settings.open({
              kind: 'root'
            })
          }}
          onDuplicate={() => {
            setTabMenuViewId(null)
            engine.views.duplicate(view.id)
          }}
          onRemove={() => {
            if (views.length <= 1) {
              return
            }

            setTabMenuViewId(null)
            engine.views.remove(view.id)
          }}
        />
      ))}
      <CreateViewPopover />
    </div>
  )
}
