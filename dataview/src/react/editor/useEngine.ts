import type {
  GroupEngine
} from '@/engine'
import { useEditorContext } from './provider'

export const useEngine = (): GroupEngine => useEditorContext().engine
