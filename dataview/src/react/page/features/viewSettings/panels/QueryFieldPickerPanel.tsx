import { getDocumentProperties } from '@dataview/core/document'
import { getAvailableFilterProperties } from '@dataview/react/page/features/filter/filterUi'
import { getAvailableSorterProperties } from '@dataview/react/page/features/sort'
import { PropertyPicker } from '@dataview/react/page/features/viewQuery/PropertyPicker'
import {
  useCurrentView,
  useDataView,
  useDocument
} from '@dataview/react/dataview'
import { meta } from '@dataview/meta'
import { useViewSettings } from '../context'

export const QueryFieldPickerPanel = (props: {
  kind: 'filter' | 'sort'
}) => {
  const dataView = useDataView()
  const engine = dataView.engine
  const page = dataView.page
  const document = useDocument()
  const currentView = useCurrentView(view => view?.view)
  const currentViewDomain = currentView
    ? engine.view(currentView.id)
    : undefined
  const properties = getDocumentProperties(document)
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
