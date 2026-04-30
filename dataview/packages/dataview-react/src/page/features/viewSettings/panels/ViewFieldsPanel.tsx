import {
  Eye,
  EyeOff,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Field } from '@dataview/core/types'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Menu, type MenuItem, type MenuReorderItem } from '@shared/ui/menu'
import {
  useDataView,
  usePageModel
} from '@dataview/react/dataview'
import { meta } from '@dataview/meta'
import {
  buildFieldActionItem,
  buildFieldReorderItem
} from '@dataview/react/menu-builders'
import { useTranslation } from '@shared/i18n/react'
import {
  useStoreValue
} from '@shared/react'

export const ViewFieldsPanel = () => {
  const { t } = useTranslation()
  const dataView = useDataView()
  const engine = dataView.engine
  const pageModel = usePageModel()
  const settings = useStoreValue(pageModel.settings)
  const currentView = settings.view
  const currentViewDomain = currentView
    ? engine.active
    : undefined
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const displayFieldIds = settings.displayFieldIds
  const visibleFields = settings.visibleFields
  const hiddenFields = settings.hiddenFields
  const filteredVisibleFields = useMemo(
    () => visibleFields.filter(field => {
      if (!normalizedQuery) {
        return true
      }

      const kindLabel = t(meta.field.kind.get(field.kind).token).toLowerCase()
      return field.name.toLowerCase().includes(normalizedQuery) || kindLabel.includes(normalizedQuery)
    }),
    [normalizedQuery, t, visibleFields]
  )
  const filteredHiddenFields = useMemo(
    () => hiddenFields.filter(field => {
      if (!normalizedQuery) {
        return true
      }

      const kindLabel = t(meta.field.kind.get(field.kind).token).toLowerCase()
      return field.name.toLowerCase().includes(normalizedQuery) || kindLabel.includes(normalizedQuery)
    }),
    [hiddenFields, normalizedQuery, t]
  )
  const hideableVisiblePropertyIds = displayFieldIds
  const hasFilteredResults = filteredVisibleFields.length > 0 || filteredHiddenFields.length > 0
  const buildVisibilityAccessory = (field: Field, visible: boolean) => (
    <Button
      aria-label={t(
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
      handleAriaLabel: t(meta.ui.viewSettings.fieldsPanel.reorder(field.name)),
      accessory: buildVisibilityAccessory(field, true),
      onSelect: () => {
        currentViewDomain?.display.hide(field.id)
      }
    })
  )), [currentViewDomain?.display, t, visibleFields])
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
          placeholder={t(meta.ui.fieldPicker.searchPlaceholder)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="mb-1 flex items-center gap-3 px-2 text-sm mb-2 font-medium text-muted-foreground">
          <div className="min-w-0 flex-1">
            {t(meta.ui.viewSettings.fieldsPanel.shownIn(currentView?.type))}
          </div>
          {hideableVisiblePropertyIds.length !== 0 ? (
            <button
              type="button"
              className="text-primary transition-colors hover:text-primary/80"
              onClick={() => {
                currentViewDomain?.display.clear()
              }}
            >
              {t(meta.ui.viewSettings.fieldsPanel.hideAll)}
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
                    {
                      before: nextBeforeFieldId
                    }
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
            {t(meta.ui.fieldPicker.empty)}
          </div>
        )}
      </div>
    </div>
  )
}
