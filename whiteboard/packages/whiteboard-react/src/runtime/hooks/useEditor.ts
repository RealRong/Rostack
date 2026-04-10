import type {
  WhiteboardInstance,
  WhiteboardRuntime
} from '#react/types/runtime'
import { useStoreValue } from '@shared/react'
import { useWhiteboardServices } from './useWhiteboard'

type EditTarget = ReturnType<ReturnType<WhiteboardInstance['select']['edit']>['get']>
type Tool = ReturnType<ReturnType<WhiteboardInstance['select']['tool']>['get']>
type InteractionState = ReturnType<ReturnType<WhiteboardInstance['select']['interaction']>['get']>

export const useEditorRuntime = (): WhiteboardRuntime => {
  return useWhiteboardServices().editor
}

export const useEditor = (): WhiteboardRuntime => useEditorRuntime()

export const useEditorSelect = <T,>(
  selector: (editor: WhiteboardRuntime) => {
    get: () => T
    subscribe: (listener: () => void) => () => void
  }
): T => {
  const editor = useEditorRuntime()
  return useStoreValue(selector(editor))
}

export const useEdit = (): EditTarget => {
  return useEditorSelect(editor => editor.select.edit())
}

export const useTool = (): Tool => {
  return useEditorSelect(editor => editor.select.tool())
}

export const useInteraction = (): InteractionState => {
  return useEditorSelect(editor => editor.select.interaction())
}
