import { FieldKindPicker } from '#react/field/schema/index.ts'
import { useDataView } from '#react/dataview/index.ts'
import { meta, renderMessage } from '@dataview/meta'
import { useViewSettings } from '#react/page/features/viewSettings/context.tsx'

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
