import type { EdgeId } from '@whiteboard/core/types'
import { useMemo } from 'react'
import { useEditorRuntime } from '../../../runtime/hooks/useEditor'
import { useOptionalKeyedStoreValue } from '../../../runtime/hooks/useStoreValue'
import type {
  EdgeState,
  EdgeView,
  SelectedEdgeRoutePointView,
  SelectedEdgeView
} from '../../../types/edge'
import { useSelection } from '../../node/selection'

const EMPTY_EDGE_STATE: EdgeState = {
  patched: false,
  activeRouteIndex: undefined
}

export const useEdgeView = (
  edgeId: EdgeId | undefined
): EdgeView | undefined => {
  const editor = useEditorRuntime()
  const item = useOptionalKeyedStoreValue(
    editor.read.edge.item,
    edgeId,
    undefined
  )
  const resolved = useOptionalKeyedStoreValue(
    editor.read.edge.resolved,
    edgeId,
    undefined
  )

  return useMemo(() => {
    if (!item || !resolved) {
      return undefined
    }

    return {
      edge: item.edge,
      ...resolved
    }
  }, [item, resolved])
}

export const useSelectedEdgeView = (): SelectedEdgeView | undefined => {
  const selection = useSelection()
  const edgeId = selection.summary.kind === 'edge' && selection.summary.items.count === 1
    ? selection.summary.target.edgeId
    : undefined
  const entry = useEdgeView(edgeId)
  const editor = useEditorRuntime()
  const state = useOptionalKeyedStoreValue(
    editor.read.edge.state,
    edgeId,
    EMPTY_EDGE_STATE
  )

  return useMemo(() => {
    if (!edgeId || !entry) {
      return undefined
    }

    const isStepManual =
      entry.edge.type === 'step'
      && entry.edge.route?.kind === 'manual'
    const routePoints: SelectedEdgeRoutePointView[] = entry.handles.flatMap<SelectedEdgeRoutePointView>((handle) => {
      if (handle.kind === 'anchor') {
        if (isStepManual) {
          return []
        }

        return [{
          key: `${edgeId}:anchor:${handle.index}`,
          kind: 'anchor',
          edgeId,
          point: handle.point,
          active: state.activeRouteIndex === handle.index,
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
          active: state.activeRouteIndex === handle.insertIndex,
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
  }, [edgeId, entry, state.activeRouteIndex])
}

export type {
  EdgeResolved,
  EdgeState,
  EdgeView,
  SelectedEdgeRoutePointView,
  SelectedEdgeView
} from '../../../types/edge'
