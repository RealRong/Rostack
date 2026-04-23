import { FieldPicker } from '@dataview/react/field/picker'
import {
  useDataView,
  usePageModel
} from '@dataview/react/dataview'
import { meta } from '@dataview/meta'
import { useViewSettings } from '@dataview/react/page/features/viewSettings/context'
import {
  useStoreValue
} from '@shared/react'

export const QueryFieldPickerPanel = (props: {
  kind: 'filter' | 'sort'
}) => {
  const dataView = useDataView()
  const engine = dataView.engine
  const page = dataView.session.page
  const pageModel = usePageModel()
  const settings = useStoreValue(pageModel.settings)
  const query = useStoreValue(pageModel.query)
  const sortPanel = useStoreValue(pageModel.sortPanel)
  const currentView = settings.view
  const currentViewDomain = currentView
    ? engine.active
    : undefined
  const router = useViewSettings()

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <FieldPicker
        fields={props.kind === 'filter'
          ? query.availableFilterFields
          : sortPanel.availableFields}
        emptyMessage={props.kind === 'filter'
          ? meta.ui.fieldPicker.allFiltered
          : meta.ui.fieldPicker.allSorted}
        onSelect={fieldId => {
          if (!currentViewDomain) {
            return
          }

          if (props.kind === 'filter') {
            const id = currentViewDomain.filters.create(fieldId)
            page.query.open({
              kind: 'filter',
              id
            })
            router.close()
            return
          }

          const id = currentViewDomain.sort.create(fieldId)
          page.query.open({
            kind: 'sort',
            id
          })
          router.close()
        }}
      />
    </div>
  )
}
