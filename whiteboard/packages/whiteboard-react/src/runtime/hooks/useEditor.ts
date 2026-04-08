import type {
  WhiteboardInstance,
  WhiteboardRuntime
} from '#react/types/runtime'
import { useStoreValue } from '@shared/react'
import { useWhiteboardServices } from './useWhiteboard'

type EditTarget = ReturnType<WhiteboardInstance['state']['edit']['get']>
type Tool = ReturnType<WhiteboardInstance['state']['tool']['get']>
type InteractionState = ReturnType<WhiteboardInstance['state']['interaction']['get']>

export const useEditorRuntime = (): WhiteboardRuntime => {
  return useWhiteboardServices().editor
}

export const useEditor = (): WhiteboardRuntime => useEditorRuntime()

export const useEdit = (): EditTarget => {
  const editor = useEditorRuntime()
  return useStoreValue(editor.state.edit)
}

export const useTool = (): Tool => {
  const editor = useEditorRuntime()
  return useStoreValue(editor.state.tool)
}

export const useInteraction = (): InteractionState => {
  const editor = useEditorRuntime()
  return useStoreValue(editor.state.interaction)
}
