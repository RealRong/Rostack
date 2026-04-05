import type { AppearanceId } from '@dataview/react/runtime/currentView'
import {
  useSelection,
  useSelectionValue
} from '@dataview/react/dataview'
import { useStoreSelector } from '@dataview/react/dataview/storeSelector'
import type { TableController } from '../controller'

export const useEffectiveRowSelected = (
  table: TableController,
  rowId: AppearanceId
) => {
  const previewSelected = useStoreSelector(
    table.marqueeSelection,
    selection => selection
      ? selection.ids.includes(rowId)
      : null
  )
  const committedSelected = useSelectionValue(
    selection => selection.ids.includes(rowId)
  )

  return previewSelected ?? committedSelected
}

export const useEffectiveRowSelection = (
  table: TableController
) => {
  const previewSelection = useStoreSelector(
    table.marqueeSelection,
    selection => selection
  )
  const committedSelection = useSelection()

  return previewSelection ?? committedSelection
}
