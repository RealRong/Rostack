import type { EdgeId } from '@whiteboard/core/types'
import { useMemo } from 'react'
import { useOptionalKeyedStoreValue, useStoreValue } from '@shared/react'
import { useEditorRuntime } from '#whiteboard-react/runtime/hooks'
import type {
  EdgeView,
  SelectedEdgeRoutePointView,
  SelectedEdgeView
} from '#whiteboard-react/types/edge'

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

export const useSelectedEdgeView = (): SelectedEdgeView | undefined => {
  const editor = useEditorRuntime()
  const selection = useStoreValue(editor.store.selection)
  const edgeId = selection.nodeIds.length === 0 && selection.edgeIds.length === 1
    ? selection.edgeIds[0]
    : undefined
  const entry = useEdgeView(edgeId)

  return useMemo(() => {
    if (!edgeId || !entry) {
      return undefined
    }

    const isStepManual =
      entry.edge.type === 'elbow'
      && entry.edge.route?.kind === 'manual'
    const routePoints: SelectedEdgeRoutePointView[] = entry.handles.flatMap<SelectedEdgeRoutePointView>((handle: EdgeView['handles'][number]) => {
      if (handle.kind === 'anchor') {
        if (isStepManual) {
          return []
        }

        return [{
          key: `${edgeId}:anchor:${handle.index}`,
          kind: 'anchor',
          edgeId,
          point: handle.point,
          active: entry.activeRouteIndex === handle.index,
          deletable: true,
          pick: {
            kind: 'anchor',
            index: handle.index
          }
        }]
      }

      if (handle.kind === 'segment') {
        return [{
          key: `${edgeId}:${handle.role}:${handle.segmentIndex}`,
          kind: handle.role,
          edgeId,
          point: handle.point,
          active: entry.activeRouteIndex === handle.insertIndex,
          deletable: false,
          pick: {
            kind: 'segment',
            insertIndex: handle.insertIndex,
            segmentIndex: handle.segmentIndex,
            axis: handle.axis
          }
        }]
      }

      return []
    })

    return {
      edgeId,
      ends: entry.ends,
      routePoints
    }
  }, [edgeId, entry])
}

export type {
  EdgeResolved,
  EdgeState,
  EdgeView,
  SelectedEdgeRoutePointView,
  SelectedEdgeView
} from '#whiteboard-react/types/edge'
