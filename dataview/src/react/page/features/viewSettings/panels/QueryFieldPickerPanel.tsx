import { getAvailableFilterProperties } from '@dataview/react/page/features/filter/filterUi'
import { getAvailableSorterProperties } from '@dataview/react/page/features/sort'
import { PropertyPicker } from '@dataview/react/page/features/viewQuery/PropertyPicker'
import {
  useActiveView,
  useEngine,
  usePageActions,
  useProperties
} from '@dataview/react/editor'
import { meta } from '@dataview/meta'
import { useViewSettings } from '../context'

export const QueryFieldPickerPanel = (props: {
  kind: 'filter' | 'sort'
}) => {
  const engine = useEngine()
  const page = usePageActions()
  const currentView = useActiveView()
  const currentViewDomain = currentView
    ? engine.view(currentView.id)
    : undefined
  const properties = useProperties()
  const router = useViewSettings()

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <PropertyPicker
        properties={props.kind === 'filter'
          ? getAvailableFilterProperties(properties, currentView?.query.filter.rules ?? [])
          : getAvailableSorterProperties(properties, currentView?.query.sorters ?? [])}
        emptyMessage={props.kind === 'filter'
          ? meta.ui.fieldPicker.allFiltered
          : meta.ui.fieldPicker.allSorted}
        onSelect={propertyId => {
          if (props.kind === 'filter') {
            currentViewDomain?.filters.add(propertyId)
            page.query.open({
              kind: 'filter',
              propertyId
            })
            router.close()
            return
          }

          currentViewDomain?.sorters.add(propertyId)
          page.query.open({
            kind: 'sort'
          })
          router.close()
        }}
      />
    </div>
  )
}
