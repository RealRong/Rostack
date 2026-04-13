import { getDocumentFields } from '@dataview/core/document'
import {
  useDataView,
  useDataViewValue
} from '@dataview/react/dataview'
import { Menu, type MenuItem } from '@ui/menu'
import { meta, renderMessage } from '@dataview/meta'
import { buildFieldToggleItem } from '@dataview/react/menu-builders'
import { useViewSettings } from '../context'

export const GroupFieldPickerPanel = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const document = useDataViewValue(dataView => dataView.engine.read.document)
  const currentView = useDataViewValue(
    dataView => dataView.engine.view.config
  )
  const groupProjection = useDataViewValue(
    dataView => dataView.engine.view.state,
    state => state?.query.group
  )
  const currentViewDomain = currentView
    ? engine.view
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
