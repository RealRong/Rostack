import {
  Eye,
  EyeOff,
  GripVertical
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Field } from '@dataview/core/contracts'
import { getDocumentFields } from '@dataview/core/document'
import { Button } from '@ui/button'
import { Input } from '@ui/input'
import {
  VerticalReorderList,
  type VerticalReorderItemState
} from '@ui/vertical-reorder-list'
import { cn } from '@ui/utils'
import {
  useCurrentView,
  useDataView,
  useDocument
} from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'

interface FieldRowProps {
  property: Field
  visible: boolean
  onToggle: (checked: boolean) => void
  drag?: VerticalReorderItemState
}

const FieldRow = (props: FieldRowProps) => {
  const kind = meta.field.kind.get(props.property.kind)
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
          ? renderMessage(meta.ui.viewSettings.fieldsPanel.reorder(props.property.name))
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
            ? meta.ui.viewSettings.fieldsPanel.hide(props.property.name)
            : meta.ui.viewSettings.fieldsPanel.show(props.property.name)
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

export const ViewFieldsPanel = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const document = useDocument()
  const currentView = useCurrentView(view => view?.view)
  const currentViewDomain = currentView
    ? engine.view(currentView.id)
    : undefined
  const fields = getDocumentFields(document)
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const displayFieldIds = currentView?.options.display.fieldIds ?? []
  const propertyMap = useMemo(
    () => new Map(fields.map(property => [property.id, property] as const)),
    [fields]
  )
  const visibleFields = useMemo(
    () => displayFieldIds
      .map(fieldId => propertyMap.get(fieldId))
      .filter((property): property is Field => Boolean(property)),
    [displayFieldIds, propertyMap]
  )
  const hiddenProperties = useMemo(
    () => fields.filter(property => !displayFieldIds.includes(property.id)),
    [displayFieldIds, fields]
  )
  const filteredVisibleProperties = useMemo(
    () => visibleFields.filter(property => {
      if (!normalizedQuery) {
        return true
      }

      const kindLabel = renderMessage(meta.field.kind.get(property.kind).message).toLowerCase()
      return property.name.toLowerCase().includes(normalizedQuery) || kindLabel.includes(normalizedQuery)
    }),
    [normalizedQuery, visibleFields]
  )
  const filteredHiddenProperties = useMemo(
    () => hiddenProperties.filter(property => {
      if (!normalizedQuery) {
        return true
      }

      const kindLabel = renderMessage(meta.field.kind.get(property.kind).message).toLowerCase()
      return property.name.toLowerCase().includes(normalizedQuery) || kindLabel.includes(normalizedQuery)
    }),
    [hiddenProperties, normalizedQuery]
  )
  const hideableVisiblePropertyIds = displayFieldIds
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
            {renderMessage(meta.ui.viewSettings.fieldsPanel.shownIn(currentView?.type))}
          </div>
          {hideableVisiblePropertyIds.length !== 0 && <div
            onClick={() => {
              currentViewDomain?.display.setVisibleFields(
                []
              )
            }}
            className='text-primary cursor-pointer'
          >
            {renderMessage(meta.ui.viewSettings.fieldsPanel.hideAll)}
          </div>}
        </div>

        {hasFilteredResults ? (
          <div className="flex flex-col gap-0.5">
            <VerticalReorderList
              items={filteredVisibleProperties}
              getItemId={property => property.id}
              onMove={(from, to) => {
                const fieldId = displayFieldIds[from]
                const beforeFieldId = displayFieldIds[to]
                if (!fieldId || !beforeFieldId || fieldId === beforeFieldId) {
                  return
                }

                const nextBeforeFieldId = from < to
                  ? displayFieldIds[to + 1] ?? null
                  : beforeFieldId
                currentViewDomain?.display.moveVisibleFields(
                  [fieldId],
                  nextBeforeFieldId
                )
              }}
              className='gap-1'
              renderItem={(property, drag) => (
                <FieldRow
                  property={property}
                  visible
                  drag={normalizedQuery ? undefined : drag}
                  onToggle={checked => {
                    if (checked) {
                      return
                    }

                    currentViewDomain?.display.hideField(property.id)
                  }}
                />
              )}
            />

            {filteredHiddenProperties.map(property => (
              <FieldRow
                key={property.id}
                property={property}
                visible={false}
                onToggle={checked => {
                  if (!checked) {
                    return
                  }

                  currentViewDomain?.display.showField(property.id)
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
