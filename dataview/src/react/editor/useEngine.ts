import type {
  GroupEngine
} from '@dataview/engine'
import { useEditorContext } from './provider'

export const useEngine = (): GroupEngine => useEditorContext().engine
