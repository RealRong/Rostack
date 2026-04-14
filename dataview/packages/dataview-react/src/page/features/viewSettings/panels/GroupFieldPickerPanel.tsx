import { getDocumentFields } from '@dataview/core/document'
import {
  useDataView,
  useDataViewValue
} from '@dataview/react/dataview'
import { Menu, type MenuItem } from '@shared/ui/menu'
import { meta, renderMessage } from '@dataview/meta'
import { buildFieldToggleItem } from '@dataview/react/menu-builders'
import { useViewSettings } from '@dataview/react/page/features/viewSettings/context'

export const GroupFieldPickerPanel = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const document = useDataViewValue(dataView => dataView.engine.select.document)
  const currentView = useDataViewValue(
    dataView => dataView.engine.active.config
  )
  const groupProjection = useDataViewValue(
    dataView => dataView.engine.active.state,
    state => state?.query.group
  )
  const currentViewDomain = currentView
    ? engine.active
    : undefined
  const router = useViewSettings()
  const fields = getDocumentFields(document)
  const items: MenuItem[] = [
    {
      kind: 'toggle',
      key: 'none',
      label: renderMessage(meta.ui.viewSettings.none),
      checked: !groupProjection?.active,
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
