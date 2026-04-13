import { getDocumentFields } from '@dataview/core/document'
import { FieldPicker } from '#dataview-react/field/picker'
import { getAvailableFilterFields } from '#dataview-react/page/features/filter/filterUi'
import { getAvailableSorterFields } from '#dataview-react/page/features/sort'
import {
  useDataView,
  useDataViewValue
} from '#dataview-react/dataview'
import { meta } from '@dataview/meta'
import { useViewSettings } from '#dataview-react/page/features/viewSettings/context'

export const QueryFieldPickerPanel = (props: {
  kind: 'filter' | 'sort'
}) => {
  const dataView = useDataView()
  const engine = dataView.engine
  const page = dataView.page
  const document = useDataViewValue(dataView => dataView.engine.select.document)
  const currentView = useDataViewValue(
    dataView => dataView.engine.active.config
  )
  const filterProjection = useDataViewValue(
    dataView => dataView.engine.active.state,
    state => state?.query.filters
  )
  const sortProjection = useDataViewValue(
    dataView => dataView.engine.active.state,
    state => state?.query.sort
  )
  const currentViewDomain = currentView
    ? engine.active
    : undefined
  const fields = getDocumentFields(document)
  const router = useViewSettings()

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <FieldPicker
        fields={props.kind === 'filter'
          ? getAvailableFilterFields(fields, filterProjection?.rules.map(entry => entry.rule) ?? [])
          : getAvailableSorterFields(fields, sortProjection?.rules.map(entry => entry.sorter) ?? [])}
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
