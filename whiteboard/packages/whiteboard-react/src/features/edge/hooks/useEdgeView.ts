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
  const view = useOptionalKeyedStoreValue(
    editor.read.edge.view,
    edgeId,
    undefined
  )

  return useMemo(() => {
    const box = view?.render.box
    const svgPath = view?.route.svgPath
    if (!view || !box || !svgPath) {
      return undefined
    }

    return {
      edgeId: view.base.edge.id,
      edge: view.base.edge,
      selected: view.render.selected,
      box,
      path: {
        svgPath,
        points: view.route.points
      },
      labels: view.route.labels.map((label) => ({
        id: label.labelId,
        text: label.text,
        displayText: label.displayText,
        style: label.style,
        editable: label.editable,
        caret: label.caret,
        point: label.point,
        angle: label.angle,
        size: label.size,
        maskRect: label.maskRect
      }))
    }
  }, [view])
}

export const useSelectedEdgeChrome = (): SelectedEdgeChrome | undefined => {
  const editor = useEditorRuntime()
  return useStoreValue(editor.read.edge.selectedChrome)
}

export type {
  EdgeView,
  SelectedEdgeChrome,
  SelectedEdgeRoutePoint
} from '@whiteboard/react/types/edge'
