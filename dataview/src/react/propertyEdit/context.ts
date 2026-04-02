import { useEditorContext } from '@dataview/react/editor/provider'
import type {
  PropertyEditApi
} from './types'

export const usePropertyEdit = (): PropertyEditApi => (
  useEditorContext().propertyEdit
)

export const usePropertyEditInternals = () => {
  const context = useEditorContext()
  return {
    propertyEditSessionStore: context.propertyEditSessionStore
  }
}
