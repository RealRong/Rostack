import type { CustomFieldId, ViewId } from '@dataview/core/contracts'
import {
  useKeyedStoreValue,
  useStoreValue
} from '@dataview/react/store'
import { useDataView } from './provider'

export const useDocument = () => {
  const dataView = useDataView()
  return useStoreValue(dataView.engine.read.document)
}

export const useViewById = (
  viewId: ViewId | undefined
) => {
  const dataView = useDataView()
  return viewId
    ? useKeyedStoreValue(dataView.engine.read.view, viewId)
    : undefined
}

export const useFieldById = (
  fieldId: CustomFieldId
) => {
  const dataView = useDataView()
  return useKeyedStoreValue(dataView.engine.read.customField, fieldId)
}
