import { PropertyKindPicker } from '@dataview/react/properties/schema'
import { useDataView } from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import { useViewSettings } from '../context'

export const PropertyCreatePanel = () => {
  const editor = useDataView().engine
  const router = useViewSettings()

  return (
    <PropertyKindPicker
      kind={undefined}
      isTitleProperty={false}
      onSelect={kind => {
        const propertyId = editor.properties.create({
          kind,
          name: renderMessage(meta.property.kind.get(kind).defaultName)
        })
        if (!propertyId) {
          return
        }

        router.push({
          kind: 'propertyEdit',
          propertyId
        })
      }}
    />
  )
}
