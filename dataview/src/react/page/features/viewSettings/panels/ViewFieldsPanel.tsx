import {
  Eye,
  EyeOff,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Field } from '@dataview/core/contracts'
import { getDocumentFields } from '@dataview/core/document'
import { Button } from '@ui/button'
import { Input } from '@ui/input'
import { Menu, type MenuItem, type MenuReorderItem } from '@ui/menu'
import {
  useDataView,
  useDataViewValue
} from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import {
  buildFieldActionItem,
  buildFieldReorderItem
} from '@dataview/react/menu-builders'

export const ViewFieldsPanel = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const document = useDataViewValue(dataView => dataView.engine.read.document)
  const currentView = useDataViewValue(
    dataView => dataView.engine.read.activeView
  )
  const currentViewDomain = currentView
    ? engine.view(currentView.id)
    : undefined
  const fields = getDocumentFields(document)
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const displayFieldIds = currentView?.display.fields ?? []
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
  const buildVisibilityAccessory = (field: Field, visible: boolean) => (
    <Button
      aria-label={renderMessage(
        visible
          ? meta.ui.viewSettings.fieldsPanel.hide(field.name)
          : meta.ui.viewSettings.fieldsPanel.show(field.name)
      )}
      onClick={() => {
        if (visible) {
          currentViewDomain?.display.hide(field.id)
          return
        }

        currentViewDomain?.display.show(field.id)
      }}
      size="icon"
      variant="ghost"
    >
      {visible ? (
        <Eye className="size-4" size={16} strokeWidth={1.8} />
      ) : (
        <EyeOff className="size-4" size={16} strokeWidth={1.8} />
      )}
    </Button>
  )
  const visibleMenuItems = useMemo<readonly MenuItem[]>(() => filteredVisibleFields.map(field => (
    buildFieldActionItem(field, {
      accessory: buildVisibilityAccessory(field, true),
      onSelect: () => {
        currentViewDomain?.display.hide(field.id)
      }
    })
  )), [currentViewDomain?.display, filteredVisibleFields])
  const reorderVisibleItems = useMemo<readonly MenuReorderItem[]>(() => visibleFields.map(field => (
    buildFieldReorderItem(field, {
      accessory: buildVisibilityAccessory(field, true),
      onSelect: () => {
        currentViewDomain?.display.hide(field.id)
      }
    })
  )), [currentViewDomain?.display, visibleFields])
  const hiddenItems = useMemo<readonly MenuItem[]>(() => filteredHiddenFields.map(field => (
    buildFieldActionItem(field, {
      accessory: buildVisibilityAccessory(field, false),
      onSelect: () => {
        currentViewDomain?.display.show(field.id)
      }
    })
  )), [currentViewDomain?.display, filteredHiddenFields])

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
          {hideableVisiblePropertyIds.length !== 0 ? (
            <button
              type="button"
              className="text-primary transition-colors hover:text-primary/80"
              onClick={() => {
                currentViewDomain?.display.replace([])
              }}
            >
              {renderMessage(meta.ui.viewSettings.fieldsPanel.hideAll)}
            </button>
          ) : null}
        </div>

        {hasFilteredResults ? (
          <div className="flex flex-col gap-1">
            {normalizedQuery ? (
              <Menu
                items={visibleMenuItems}
                autoFocus={false}
                className="gap-1"
              />
            ) : (
              <Menu.Reorder
                items={reorderVisibleItems}
                onMove={(from, to) => {
                  const fieldId = displayFieldIds[from]
                  const beforeFieldId = displayFieldIds[to]
                  if (!fieldId || !beforeFieldId || fieldId === beforeFieldId) {
                    return
                  }

                  const nextBeforeFieldId = from < to
                    ? displayFieldIds[to + 1] ?? null
                    : beforeFieldId
                  currentViewDomain?.display.move(
                    [fieldId],
                    nextBeforeFieldId
                  )
                }}
                className="gap-1"
              />
            )}

            {hiddenItems.length ? (
              <Menu
                items={hiddenItems}
                autoFocus={false}
                className="gap-1"
              />
            ) : null}
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
