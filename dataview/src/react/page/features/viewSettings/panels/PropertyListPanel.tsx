import { Plus } from 'lucide-react'
import { PropertyPicker } from '@dataview/react/page/features/viewQuery/PropertyPicker'
import { useProperties } from '@dataview/react/editor'
import { meta, renderMessage } from '@dataview/meta'
import { Button } from '@dataview/react/ui'
import { useViewSettings } from '../context'

export const PropertyListPanel = () => {
  const router = useViewSettings()
  const properties = useProperties()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PropertyPicker
        properties={properties}
        onSelect={propertyId => {
          router.push({
            kind: 'propertyEdit',
            propertyId
          })
        }}
      />
      <div className="ui-divider-top px-2 py-2">
        <Button
          className='w-full'
          leading={<Plus className="size-4 shrink-0" size={16} strokeWidth={1.8} />}
          onClick={() => router.push({ kind: 'propertyCreate' })}
        >
          {renderMessage(meta.ui.viewSettings.propertiesPanel.add)}
        </Button>
      </div>
    </div>
  )
}
