import { Plus } from 'lucide-react'
import { getDocumentCustomFields } from '@dataview/core/document'
import { FieldPicker } from '@dataview/react/field/picker'
import { Menu } from '@shared/ui/menu'
import { useDataViewValue } from '@dataview/react/dataview'
import { meta } from '@dataview/meta'
import { useTranslation } from '@shared/i18n/react'
import { useViewSettings } from '@dataview/react/page/features/viewSettings/context'

export const FieldListPanel = () => {
  const { t } = useTranslation()
  const router = useViewSettings()
  const document = useDataViewValue(dataView => dataView.engine.select.document)
  const fields = getDocumentCustomFields(document)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FieldPicker
        fields={fields}
        onSelect={fieldId => {
          router.push({
            kind: 'fieldSchema',
            fieldId
          })
        }}
      />
      <div className="border-t border-divider px-2 py-2">
        <Menu
          autoFocus={false}
          items={[{
            kind: 'action',
            key: 'create',
            label: t(meta.ui.viewSettings.fieldsPanel.add),
            leading: <Plus className="size-4 shrink-0" size={16} strokeWidth={1.8} />,
            onSelect: () => router.push({ kind: 'fieldCreate' })
          }]}
        />
      </div>
    </div>
  )
}
