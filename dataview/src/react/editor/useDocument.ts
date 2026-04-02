import type {
  PropertyId,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentProperties,
  getDocumentViews
} from '@dataview/core/document'
import {
  TITLE_PROPERTY_ID
} from '@dataview/core/property'
import {
  useKeyedStoreValue,
  useStoreValue
} from '@dataview/react/runtime/store'
import { useEngine } from './useEngine'
import { usePageValue } from './usePage'

export const useDocument = () => {
  const engine = useEngine()
  return useStoreValue(engine.read.document)
}

export const useViews = () => {
  const document = useDocument()
  return getDocumentViews(document)
}

export const useProperties = () => {
  const document = useDocument()
  return getDocumentProperties(document)
}

export const useViewById = (
  viewId: ViewId | undefined
) => {
  const engine = useEngine()
  return viewId
    ? useKeyedStoreValue(engine.read.view, viewId)
    : undefined
}

export const useActiveView = () => {
  const activeViewId = usePageValue(state => state.activeViewId)
  return useViewById(activeViewId)
}

export const usePropertyById = (
  propertyId: PropertyId
) => {
  const engine = useEngine()
  return useKeyedStoreValue(engine.read.property, propertyId)
}

export const useTitlePropertyId = (): PropertyId => TITLE_PROPERTY_ID
