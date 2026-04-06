import { getDocumentCustomFields } from '@dataview/core/document'
import { getAvailableFilterProperties } from '@dataview/react/page/features/filter/filterUi'
import { getAvailableSorterProperties } from '@dataview/react/page/features/sort'
import { FieldPicker } from '@dataview/react/page/features/viewQuery/FieldPicker'
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
  const fields = getDocumentCustomFields(document)
  const router = useViewSettings()

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <FieldPicker
        fields={props.kind === 'filter'
          ? getAvailableFilterProperties(fields, currentView?.query.filter.rules ?? [])
          : getAvailableSorterProperties(fields, currentView?.query.sorters ?? [])}
        emptyMessage={props.kind === 'filter'
          ? meta.ui.fieldPicker.allFiltered
          : meta.ui.fieldPicker.allSorted}
        onSelect={fieldId => {
          if (props.kind === 'filter') {
            currentViewDomain?.filters.add(fieldId)
            page.query.open({
              kind: 'filter',
              fieldId
            })
            router.close()
            return
          }

          currentViewDomain?.sorters.add(fieldId)
          page.query.open({
            kind: 'sort'
          })
          router.close()
        }}
      />
    </div>
  )
}
