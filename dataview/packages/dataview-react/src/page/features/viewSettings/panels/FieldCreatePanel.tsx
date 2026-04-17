import { FieldKindPicker } from '@dataview/react/field/schema'
import { useDataView } from '@dataview/react/dataview'
import { meta } from '@dataview/meta'
import { useTranslation } from '@shared/i18n/react'
import { useViewSettings } from '@dataview/react/page/features/viewSettings/context'

export const FieldCreatePanel = () => {
  const { t } = useTranslation()
  const editor = useDataView().engine
  const router = useViewSettings()

  return (
    <FieldKindPicker
      kind={undefined}
      isTitleProperty={false}
      onSelect={kind => {
        const fieldId = editor.fields.create({
          kind,
          name: t(meta.field.kind.get(kind).defaultName)
        })
        if (!fieldId) {
          return
        }

        editor.active.display.show(fieldId)
        router.push({
          kind: 'fieldSchema',
          fieldId
        })
      }}
    />
  )
}
