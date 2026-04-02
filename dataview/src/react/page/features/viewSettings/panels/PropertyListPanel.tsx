import { Plus } from 'lucide-react'
import { getDocumentProperties } from '@dataview/core/document'
import { PropertyPicker } from '@dataview/react/page/features/viewQuery/PropertyPicker'
import { Button } from '@ui/button'
import { useDocument } from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import { useViewSettings } from '../context'

export const PropertyListPanel = () => {
  const router = useViewSettings()
  const properties = getDocumentProperties(useDocument())

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
