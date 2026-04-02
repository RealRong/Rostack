import type {
  PropertyId,
  ViewId
} from '@dataview/core/contracts'
import {
  TITLE_PROPERTY_ID
} from '@dataview/core/property'
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

export const usePropertyById = (
  propertyId: PropertyId
) => {
  const dataView = useDataView()
  return useKeyedStoreValue(dataView.engine.read.property, propertyId)
}

export const useTitlePropertyId = (): PropertyId => TITLE_PROPERTY_ID
