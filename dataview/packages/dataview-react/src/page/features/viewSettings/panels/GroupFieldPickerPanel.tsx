import {
  useDataView,
  usePageRuntime
} from '@dataview/react/dataview'
import { Menu, type MenuItem } from '@shared/ui/menu'
import { meta } from '@dataview/meta'
import { buildFieldToggleItem } from '@dataview/react/menu-builders'
import { useViewSettings } from '@dataview/react/page/features/viewSettings/context'
import { useTranslation } from '@shared/i18n/react'
import {
  useStoreValue
} from '@shared/react'

export const GroupFieldPickerPanel = () => {
  const { t } = useTranslation()
  const dataView = useDataView()
  const engine = dataView.engine
  const pageRuntime = usePageRuntime()
  const settings = useStoreValue(pageRuntime.settings)
  const currentView = settings.currentView
  const groupProjection = settings.group
  const currentViewDomain = currentView
    ? engine.active
    : undefined
  const router = useViewSettings()
  const fields = settings.fields
  const items: MenuItem[] = [
    {
      kind: 'toggle',
      key: 'none',
      label: t(meta.ui.viewSettings.none),
      checked: !groupProjection,
      onSelect: () => {
        currentViewDomain?.group.clear()
        router.back()
      }
    },
    ...fields.map(field => (
      buildFieldToggleItem(field, {
        checked: groupProjection?.fieldId === field.id,
        onSelect: () => {
          currentViewDomain?.group.set(field.id)
          router.back()
        }
      })
    ))
  ]

  return (
    <div className="min-h-0 flex-1 overflow-hidden px-2 py-2">
      <Menu
        items={items}
        autoFocus={false}
      />
    </div>
  )
}
