import type {
  WhiteboardInstance,
  WhiteboardRuntime
} from '#whiteboard-react/types/runtime'
import { useStoreValue } from '@shared/react'
import type { ReadStore } from '@shared/core'
import { useWhiteboardServices } from '#whiteboard-react/runtime/hooks/useWhiteboard'

type EditTarget = ReturnType<WhiteboardInstance['store']['edit']['get']>
type Tool = ReturnType<WhiteboardInstance['store']['tool']['get']>
type InteractionState = ReturnType<WhiteboardInstance['store']['interaction']['get']>

export const useEditorRuntime = (): WhiteboardRuntime => {
  return useWhiteboardServices().editor
}

export const useEditor = (): WhiteboardRuntime => useEditorRuntime()

export const useEditorStore = <T,>(
  selector: (editor: WhiteboardRuntime) => ReadStore<T>
): T => {
  const editor = useEditorRuntime()
  return useStoreValue(selector(editor))
}

export const useEdit = (): EditTarget => {
  return useEditorStore(editor => editor.store.edit)
}

export const useTool = (): Tool => {
  return useEditorStore(editor => editor.store.tool)
}

export const useInteraction = (): InteractionState => {
  return useEditorStore(editor => editor.store.interaction)
}
