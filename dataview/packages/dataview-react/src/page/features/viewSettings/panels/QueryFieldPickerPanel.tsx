import { FieldPicker } from '@dataview/react/field/picker'
import {
  useDataView,
  usePageRuntime
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
  const pageRuntime = usePageRuntime()
  const settings = useStoreValue(pageRuntime.settings)
  const queryBar = useStoreValue(pageRuntime.queryBar)
  const currentView = settings.currentView
  const currentViewDomain = currentView
    ? engine.active
    : undefined
  const router = useViewSettings()

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <FieldPicker
        fields={props.kind === 'filter'
          ? queryBar.availableFilterFields
          : queryBar.availableSortFields}
        emptyMessage={props.kind === 'filter'
          ? meta.ui.fieldPicker.allFiltered
          : meta.ui.fieldPicker.allSorted}
        onSelect={fieldId => {
          if (props.kind === 'filter') {
            currentViewDomain?.filters.add(fieldId)
            page.query.open({
              kind: 'filter',
              index: queryBar.filters.length
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
