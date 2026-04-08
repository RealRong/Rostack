import { getDocumentFields } from '@dataview/core/document'
import { getAvailableFilterFields } from '@dataview/react/page/features/filter/filterUi'
import { getAvailableSorterFields } from '@dataview/react/page/features/sort'
import { FieldPicker } from '@dataview/react/page/features/viewQuery/FieldPicker'
import {
  useDataView,
  useDataViewValue
} from '@dataview/react/dataview'
import { meta } from '@dataview/meta'
import { useViewSettings } from '../context'

export const QueryFieldPickerPanel = (props: {
  kind: 'filter' | 'sort'
}) => {
  const dataView = useDataView()
  const engine = dataView.engine
  const page = dataView.page
  const document = useDataViewValue(dataView => dataView.engine.read.document)
  const currentView = useDataViewValue(
    dataView => dataView.currentView,
    view => view?.view
  )
  const currentViewDomain = currentView
    ? engine.view(currentView.id)
    : undefined
  const fields = getDocumentFields(document)
  const router = useViewSettings()

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <FieldPicker
        fields={props.kind === 'filter'
          ? getAvailableFilterFields(fields, currentView?.filter.rules ?? [])
          : getAvailableSorterFields(fields, currentView?.sort ?? [])}
        emptyMessage={props.kind === 'filter'
          ? meta.ui.fieldPicker.allFiltered
          : meta.ui.fieldPicker.allSorted}
        onSelect={fieldId => {
          if (props.kind === 'filter') {
            currentViewDomain?.filter.add(fieldId)
            page.query.open({
              kind: 'filter',
              fieldId
            })
            router.close()
            return
          }

          currentViewDomain?.sort.add(fieldId)
          page.query.open({
            kind: 'sort'
          })
          router.close()
        }}
      />
    </div>
  )
}
