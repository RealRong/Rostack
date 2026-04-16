import type { EdgeId } from '@whiteboard/core/types'
import { useOptionalKeyedStoreValue, useStoreValue } from '@shared/react'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'
import type {
  EdgeView,
  SelectedEdgeChrome,
  SelectedEdgeRoutePoint
} from '@whiteboard/react/types/edge'

export const useEdgeView = (
  edgeId: EdgeId | undefined
): EdgeView | undefined => {
  const editor = useEditorRuntime()
  return useOptionalKeyedStoreValue(
    editor.read.edge.view,
    edgeId,
    undefined
  )
}

export const useSelectedEdgeChrome = (): SelectedEdgeChrome | undefined => {
  const editor = useEditorRuntime()
  return useStoreValue(editor.read.edge.selectedChrome)
}

export type {
  EdgeResolved,
  EdgeState,
  EdgeView,
  SelectedEdgeChrome,
  SelectedEdgeRoutePoint
} from '@whiteboard/react/types/edge'
