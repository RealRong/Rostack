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
  field: Field
  visible: boolean
  onToggle: (checked: boolean) => void
  drag?: VerticalReorderItemState
}

const FieldRow = (props: FieldRowProps) => {
  const kind = meta.field.kind.get(props.field.kind)
  const Icon = kind.Icon

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 h-7 transition-opacity',
        props.drag?.dragging && 'opacity-70'
      )}
    >
      <Button
        aria-label={props.drag
          ? renderMessage(meta.ui.viewSettings.fieldsPanel.reorder(props.field.name))
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
        <span className="truncate text-sm">{props.field.name}</span>
      </div>

      <Button
        aria-label={renderMessage(
          props.visible
            ? meta.ui.viewSettings.fieldsPanel.hide(props.field.name)
            : meta.ui.viewSettings.fieldsPanel.show(props.field.name)
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
  const fieldMap = useMemo(
    () => new Map(fields.map(field => [field.id, field] as const)),
    [fields]
  )
  const visibleFields = useMemo(
    () => displayFieldIds
      .map(fieldId => fieldMap.get(fieldId))
      .filter((field): field is Field => Boolean(field)),
    [displayFieldIds, fieldMap]
  )
  const hiddenFields = useMemo(
    () => fields.filter(field => !displayFieldIds.includes(field.id)),
    [displayFieldIds, fields]
  )
  const filteredVisibleFields = useMemo(
    () => visibleFields.filter(field => {
      if (!normalizedQuery) {
        return true
      }

      const kindLabel = renderMessage(meta.field.kind.get(field.kind).message).toLowerCase()
      return field.name.toLowerCase().includes(normalizedQuery) || kindLabel.includes(normalizedQuery)
    }),
    [normalizedQuery, visibleFields]
  )
  const filteredHiddenFields = useMemo(
    () => hiddenFields.filter(field => {
      if (!normalizedQuery) {
        return true
      }

      const kindLabel = renderMessage(meta.field.kind.get(field.kind).message).toLowerCase()
      return field.name.toLowerCase().includes(normalizedQuery) || kindLabel.includes(normalizedQuery)
    }),
    [hiddenFields, normalizedQuery]
  )
  const hideableVisiblePropertyIds = displayFieldIds
  const hasFilteredResults = filteredVisibleFields.length > 0 || filteredHiddenFields.length > 0

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
        <div className="mb-1 flex items-center gap-3 px-2 text-sm mb-2 font-medium text-muted-foreground">
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
          <div className="flex flex-col gap-1">
            <VerticalReorderList
              items={filteredVisibleFields}
              getItemId={field => field.id}
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
              renderItem={(field, drag) => (
                <FieldRow
                  field={field}
                  visible
                  drag={normalizedQuery ? undefined : drag}
                  onToggle={checked => {
                    if (checked) {
                      return
                    }

                    currentViewDomain?.display.hideField(field.id)
                  }}
                />
              )}
            />

            {filteredHiddenFields.map(field => (
              <FieldRow
                key={field.id}
                field={field}
                visible={false}
                onToggle={checked => {
                  if (!checked) {
                    return
                  }

                  currentViewDomain?.display.showField(field.id)
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
