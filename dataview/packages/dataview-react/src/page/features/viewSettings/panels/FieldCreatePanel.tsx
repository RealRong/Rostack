import { FieldKindPicker } from '@dataview/react/field/schema'
import { useDataView } from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import { useViewSettings } from '@dataview/react/page/features/viewSettings/context'

export const FieldCreatePanel = () => {
  const editor = useDataView().engine
  const router = useViewSettings()

  return (
    <FieldKindPicker
      kind={undefined}
      isTitleProperty={false}
      onSelect={kind => {
        const fieldId = editor.fields.create({
          kind,
          name: renderMessage(meta.field.kind.get(kind).defaultName)
        })
        if (!fieldId) {
          return
        }

        router.push({
          kind: 'fieldSchema',
          fieldId
        })
      }}
    />
  )
}
