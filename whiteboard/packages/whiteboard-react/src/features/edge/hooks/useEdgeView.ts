import type { EdgeId } from '@whiteboard/core/types'
import { useMemo } from 'react'
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
  const view = useOptionalKeyedStoreValue<EdgeId, EdgeView | undefined>(
    editor.scene.edges.read,
    edgeId,
    undefined
  )

  return useMemo(() => {
    if (!view || !view.box || !view.path.svgPath) {
      return undefined
    }

    return view
  }, [view])
}

export const useSelectedEdgeChrome = (): SelectedEdgeChrome | undefined => {
  const editor = useEditorRuntime()
  return useStoreValue(editor.session.selection.edge.chrome)
}

export type {
  EdgeView,
  SelectedEdgeChrome,
  SelectedEdgeRoutePoint
} from '@whiteboard/react/types/edge'
