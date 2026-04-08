import { getDocumentFields } from '@dataview/core/document'
import {
  useCurrentView,
  useDataView,
  useDocument
} from '@dataview/react/dataview'
import { Menu, type MenuItem } from '@ui/menu'
import { meta, renderMessage } from '@dataview/meta'
import { useViewSettings } from '../context'

export const GroupFieldPickerPanel = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const document = useDocument()
  const currentView = useCurrentView(view => view?.view)
  const currentViewDomain = currentView
    ? engine.view(currentView.id)
    : undefined
  const router = useViewSettings()
  const fields = getDocumentFields(document)
  const items: MenuItem[] = [
    {
      kind: 'toggle',
      key: 'none',
      label: renderMessage(meta.ui.viewSettings.none),
      checked: !currentView?.group?.field,
      onSelect: () => {
        currentViewDomain?.group.clear()
        router.back()
      }
    },
    ...fields.map(field => {
      const fieldMeta = meta.field.kind.get(field.kind)
      const Icon = fieldMeta.Icon

      return {
        kind: 'toggle' as const,
        key: field.id,
        label: field.name,
        leading: <Icon className="size-4" size={16} strokeWidth={1.8} />,
        checked: currentView?.group?.field === field.id,
        onSelect: () => {
          currentViewDomain?.group.set(field.id)
          router.back()
        }
      }
    })
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
