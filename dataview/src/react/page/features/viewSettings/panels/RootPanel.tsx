import {
  ArrowUpDown,
  ChevronRight,
  Copy,
  Eye,
  Filter,
  PanelsTopLeft,
  SquarePen,
  Settings2,
  Trash2,
  type LucideIcon
} from 'lucide-react'
import { forwardRef, useEffect, useState } from 'react'
import type { GroupBucketSort, GroupProperty, GroupView } from '@dataview/core/contracts'
import { resolveViewGroupState } from '@dataview/core/query'
import {
  useActiveView,
  useEngine,
  useProperties,
  useViews
} from '@dataview/react/editor'
import { meta, renderMessage } from '@dataview/meta'
import { Button, Input } from '@dataview/react/ui'
import { useViewSettings } from '../context'
import { supportsGroupSettings } from '@dataview/react/page/session/settings'

type RootRouteKind = 'layout' | 'viewProperties' | 'propertyList' | 'filter' | 'sort' | 'group'

interface RootMenuItemConfig {
  icon: LucideIcon
  label: string
  suffix?: string
  panel: RootRouteKind
  visible?: boolean
}

const ViewSettingsMenuButton = forwardRef<HTMLButtonElement, RootMenuItemConfig & {
  onClick: () => void
}>((props, ref) => {
  const Icon = props.icon

  return (
    <Button
      ref={ref}
      layout="row"
      leading={<Icon size={16} strokeWidth={1.5} />}
      suffix={props.suffix}
      trailing={<ChevronRight className="size-3.5 shrink-0 text-muted-foreground" size={14} strokeWidth={2} />}
      onClick={props.onClick}
    >
      {props.label}
    </Button>
  )
})
ViewSettingsMenuButton.displayName = 'ViewSettingsMenuButton'

const ViewSettingsIdentitySection = (props: {
  currentView?: GroupView
  onRename: (name: string) => void
}) => {
  const [name, setName] = useState(props.currentView?.name ?? '')
  const Icon = meta.view.get(props.currentView?.type).Icon

  useEffect(() => {
    setName(props.currentView?.name ?? '')
  }, [props.currentView?.id, props.currentView?.name])

  const commit = () => {
    if (!props.currentView) {
      return
    }

    const nextName = name.trim()
    if (!nextName) {
      setName(props.currentView.name)
      return
    }

    if (nextName !== props.currentView.name) {
      props.onRename(nextName)
    }
  }

  return (
    <div className="ui-divider-bottom px-1.5 py-2">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground">
          <Icon className="size-4" size={16} strokeWidth={1.8} />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <Input
            value={name}
            onChange={event => setName(event.target.value)}
            onBlur={commit}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commit()
              }
            }}
            placeholder={renderMessage(meta.ui.viewSettings.viewNamePlaceholder)}
            disabled={!props.currentView}
            className="h-7 border-0 bg-transparent px-0 text-[13px] font-medium shadow-none focus-visible:border-0 focus-visible:shadow-none"
          />
        </div>
      </div>
    </div>
  )
}

const ViewSettingsActionsSection = (props: {
  canRemove: boolean
  disabled: boolean
  onDuplicate: () => void
  onRemove: () => void
}) => {
  return (
    <div className="ui-divider-top flex flex-col gap-0.5 p-2">
      <Button
        layout="row"
        leading={<Copy className="size-4" size={14} strokeWidth={1.8} />}
        disabled={props.disabled}
        onClick={props.onDuplicate}
      >
        {renderMessage(meta.ui.viewSettings.duplicate)}
      </Button>
      <Button
        variant="ghostDestructive"
        layout="row"
        leading={<Trash2 className="size-4" size={14} strokeWidth={1.8} />}
        disabled={props.disabled || !props.canRemove}
        onClick={props.onRemove}
      >
        {renderMessage(meta.ui.viewSettings.remove)}
      </Button>
    </div>
  )
}

const readGroupModeLabel = (
  property: GroupProperty | undefined,
  mode: string
) => {
  if (!property) {
    return undefined
  }

  switch (property.kind) {
    case 'status':
      return mode === 'category'
        ? renderMessage(meta.ui.viewSettings.groupByCategory)
        : renderMessage(meta.ui.viewSettings.groupByStatus)
    case 'select':
    case 'multiSelect':
      return renderMessage(meta.ui.viewSettings.groupByOption)
    case 'number':
      return renderMessage(meta.ui.viewSettings.groupByRange)
    default:
      return undefined
  }
}

const readBucketSortLabel = (bucketSort: GroupBucketSort | undefined) => {
  switch (bucketSort) {
    case 'manual':
      return renderMessage(meta.ui.viewSettings.bucketSortManual)
    case 'labelAsc':
      return renderMessage(meta.ui.viewSettings.bucketSortLabelAsc)
    case 'labelDesc':
      return renderMessage(meta.ui.viewSettings.bucketSortLabelDesc)
    case 'valueAsc':
      return renderMessage(meta.ui.viewSettings.bucketSortValueAsc)
    case 'valueDesc':
      return renderMessage(meta.ui.viewSettings.bucketSortValueDesc)
    default:
      return undefined
  }
}

const readGroupSummary = (
  group: ReturnType<typeof resolveViewGroupState>
) => {
  if (!group.property) {
    return renderMessage(meta.ui.viewSettings.none)
  }

  const parts = [group.property.name]
  const modeLabel = readGroupModeLabel(group.property, group.mode)
  const bucketSortLabel = readBucketSortLabel(group.bucketSort)

  if (modeLabel) {
    parts.push(modeLabel)
  }
  if (group.bucketInterval !== undefined) {
    parts.push(String(group.bucketInterval))
  }
  if (bucketSortLabel) {
    parts.push(bucketSortLabel)
  }

  return parts.join(' · ')
}

export const RootPanel = () => {
  const engine = useEngine()
  const router = useViewSettings()
  const currentView = useActiveView()
  const properties = useProperties()
  const viewsCount = useViews().length
  const propertyCount = currentView?.options.display.propertyIds.length ?? 0
  const group = resolveViewGroupState(properties, currentView?.query.group)
  const menuItems: RootMenuItemConfig[] = [
    {
      icon: Settings2,
      label: renderMessage(meta.ui.viewSettings.layout),
      suffix: renderMessage(meta.view.get(currentView?.type).message),
      panel: 'layout'
    },
    {
      icon: Eye,
      label: renderMessage(meta.ui.viewSettings.visibleProperties),
      suffix: renderMessage(meta.ui.viewSettings.shown(propertyCount)),
      panel: 'viewProperties'
    },
    {
      icon: SquarePen,
      label: renderMessage(meta.ui.viewSettings.editProperties),
      panel: 'propertyList'
    },
    {
      icon: Filter,
      label: renderMessage(meta.ui.viewSettings.filter),
      suffix: renderMessage(meta.ui.viewSettings.filterSummary(currentView?.query.filter.rules ?? [], properties)),
      panel: 'filter'
    },
    {
      icon: ArrowUpDown,
      label: renderMessage(meta.ui.viewSettings.sort),
      suffix: renderMessage(meta.ui.viewSettings.sortSummary(currentView?.query.sorters ?? [], properties)),
      panel: 'sort'
    },
    {
      icon: PanelsTopLeft,
      label: renderMessage(meta.ui.viewSettings.group),
      suffix: readGroupSummary(group),
      panel: 'group',
      visible: currentView
        ? supportsGroupSettings(currentView.type)
        : false
    }
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-1 pt-3 text-[11px] font-medium text-muted-foreground">
        {renderMessage(meta.ui.viewSettings.title)}
      </div>
      <ViewSettingsIdentitySection
        currentView={currentView}
        onRename={name => {
          if (!currentView) {
            return
          }

          engine.views.rename(currentView.id, name)
        }}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-col gap-0.5 px-2 pb-2 pt-2">
          {menuItems.map(item => {
            if (item.visible === false) {
              return null
            }

            return (
              <ViewSettingsMenuButton
                key={item.panel}
                {...item}
                onClick={() => router.push({ kind: item.panel })}
              />
            )
          })}
        </div>

        <ViewSettingsActionsSection
          disabled={!currentView}
          canRemove={viewsCount > 1}
          onDuplicate={() => {
            if (!currentView) {
              return
            }

            engine.views.duplicate(currentView.id)
            router.close()
          }}
          onRemove={() => {
            if (viewsCount <= 1 || !currentView) {
              return
            }

            engine.views.remove(currentView.id)
            router.close()
          }}
        />
      </div>
    </div>
  )
}
