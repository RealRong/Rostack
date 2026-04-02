import {
  Eye,
  EyeOff,
  GripVertical
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { GroupProperty } from '@/core/contracts'
import { TITLE_PROPERTY_ID } from '@/core/property'
import {
  useActiveView,
  useEngine,
  useProperties
} from '@/react/editor'
import { meta, renderMessage } from '@/meta'
import { Button, Input, VerticalReorderList, cn, type VerticalReorderItemState } from '@/react/ui'

interface PropertyRowProps {
  property: GroupProperty
  visible: boolean
  onToggle: (checked: boolean) => void
  drag?: VerticalReorderItemState
}

const PropertyRow = (props: PropertyRowProps) => {
  const kind = meta.property.kind.get(props.property.kind)
  const Icon = kind.Icon

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 transition-opacity',
        props.drag?.dragging && 'opacity-70'
      )}
    >
      <Button
        aria-label={props.drag
          ? renderMessage(meta.ui.viewSettings.propertiesPanel.reorder(props.property.name))
          : undefined}
        {...props.drag?.handle.attributes}
        {...props.drag?.handle.listeners}
        disabled={!props.drag}
        ref={props.drag?.handle.setActivatorNodeRef}
        size="icon"
        className='text-muted-foreground'
        variant="ghost"
        style={props.drag ? { touchAction: 'none' } : undefined}
      >
        <GripVertical className="size-4" size={16} strokeWidth={1.8} />
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Icon className="size-4 shrink-0" size={16} strokeWidth={1.8} />
        <span className="truncate">{props.property.name}</span>
      </div>

      <Button
        aria-label={renderMessage(
          props.visible
            ? meta.ui.viewSettings.propertiesPanel.hide(props.property.name)
            : meta.ui.viewSettings.propertiesPanel.show(props.property.name)
        )}
        onClick={() => props.onToggle(!props.visible)}
        size="icon"
        variant="ghost"
      >
        {props.visible ? (
          <Eye className="size-4" size={16} strokeWidth={1.8} />
        ) : (
          <EyeOff className="size-4" size={16} strokeWidth={1.8} />
        )}
      </Button>
    </div>
  )
}

export const ViewPropertiesPanel = () => {
  const engine = useEngine()
  const currentView = useActiveView()
  const currentViewDomain = currentView
    ? engine.view(currentView.id)
    : undefined
  const properties = useProperties()
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const titlePropertyId = TITLE_PROPERTY_ID
  const displayPropertyIds = currentView?.options.display.propertyIds ?? []
  const propertyMap = useMemo(
    () => new Map(properties.map(property => [property.id, property] as const)),
    [properties]
  )
  const visibleProperties = useMemo(
    () => displayPropertyIds
      .map(propertyId => propertyMap.get(propertyId))
      .filter((property): property is GroupProperty => Boolean(property)),
    [displayPropertyIds, propertyMap]
  )
  const hiddenProperties = useMemo(
    () => properties.filter(property => !displayPropertyIds.includes(property.id)),
    [displayPropertyIds, properties]
  )
  const filteredVisibleProperties = useMemo(
    () => visibleProperties.filter(property => {
      if (!normalizedQuery) {
        return true
      }

      const kindLabel = renderMessage(meta.property.kind.get(property.kind).message).toLowerCase()
      return property.name.toLowerCase().includes(normalizedQuery) || kindLabel.includes(normalizedQuery)
    }),
    [normalizedQuery, visibleProperties]
  )
  const filteredHiddenProperties = useMemo(
    () => hiddenProperties.filter(property => {
      if (!normalizedQuery) {
        return true
      }

      const kindLabel = renderMessage(meta.property.kind.get(property.kind).message).toLowerCase()
      return property.name.toLowerCase().includes(normalizedQuery) || kindLabel.includes(normalizedQuery)
    }),
    [hiddenProperties, normalizedQuery]
  )
  const hideableVisiblePropertyIds = useMemo(
    () => displayPropertyIds.filter(propertyId => propertyId !== titlePropertyId),
    [displayPropertyIds, titlePropertyId]
  )
  const hasFilteredResults = filteredVisibleProperties.length > 0 || filteredHiddenProperties.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-2.5 pb-1 pt-2.5">
        <Input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={renderMessage(meta.ui.fieldPicker.searchPlaceholder)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="mb-1 flex items-center gap-3 px-2 text-sm mb-3 font-medium text-muted-foreground">
          <div className="min-w-0 flex-1">
            {renderMessage(meta.ui.viewSettings.propertiesPanel.shownIn(currentView?.type))}
          </div>
          {hideableVisiblePropertyIds.length !== 0 && <div
            onClick={() => {
              currentViewDomain?.display.setVisibleProperties(
                titlePropertyId ? [titlePropertyId] : []
              )
            }}
            className='text-primary cursor-pointer'
          >
            {renderMessage(meta.ui.viewSettings.propertiesPanel.hideAll)}
          </div>}
        </div>

        {hasFilteredResults ? (
          <div className="flex flex-col gap-0.5">
            <VerticalReorderList
              items={filteredVisibleProperties}
              getItemId={property => property.id}
              onMove={(from, to) => {
                const propertyId = displayPropertyIds[from]
                const beforePropertyId = displayPropertyIds[to]
                if (!propertyId || !beforePropertyId || propertyId === beforePropertyId) {
                  return
                }

                const nextBeforePropertyId = from < to
                  ? displayPropertyIds[to + 1] ?? null
                  : beforePropertyId
                currentViewDomain?.display.moveVisibleProperties(
                  [propertyId],
                  nextBeforePropertyId
                )
              }}
              className='gap-1'
              renderItem={(property, drag) => (
                <PropertyRow
                  property={property}
                  visible
                  drag={normalizedQuery ? undefined : drag}
                  onToggle={checked => {
                    if (checked || property.id === titlePropertyId) {
                      return
                    }

                    currentViewDomain?.display.hideProperty(property.id)
                  }}
                />
              )}
            />

            {filteredHiddenProperties.map(property => (
              <PropertyRow
                key={property.id}
                property={property}
                visible={false}
                onToggle={checked => {
                  if (!checked) {
                    return
                  }

                  currentViewDomain?.display.showProperty(property.id)
                }}
              />
            ))}
          </div>
        ) : (
          <div className="px-2 py-3 text-[12px] text-muted-foreground">
            {renderMessage(meta.ui.fieldPicker.empty)}
          </div>
        )}
      </div>
    </div>
  )
}
