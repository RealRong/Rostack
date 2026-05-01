import type {
  WhiteboardInstance,
  WhiteboardRuntime
} from '@whiteboard/react/types/runtime'
import { useStoreValue } from '@shared/react'
import { store } from '@shared/core'
import { useWhiteboardServices } from '@whiteboard/react/runtime/hooks/useWhiteboard'

type Tool = ReturnType<WhiteboardInstance['scene']['editor']['tool']['get']>
type InteractionState = ReturnType<WhiteboardInstance['scene']['editor']['interaction']['get']>

export const useEditorRuntime = (): WhiteboardRuntime => {
  return useWhiteboardServices().editor
}

export const useEditor = (): WhiteboardRuntime => useEditorRuntime()

export const useEditorValue = <T,>(
  selector: (editor: WhiteboardRuntime) => store.ReadStore<T>
): T => {
  const editor = useEditorRuntime()
  return useStoreValue(selector(editor))
}

export const useTool = (): Tool => {
  return useEditorValue(editor => editor.scene.editor.tool)
}

export const useInteraction = (): InteractionState => {
  return useEditorValue(editor => editor.scene.editor.interaction)
}
