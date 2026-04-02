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

    const routePoints: SelectedEdgeRoutePointView[] = entry.handles.flatMap<SelectedEdgeRoutePointView>((handle) => {
      if (handle.kind === 'anchor') {
        return [{
          key: `${edgeId}:anchor:${handle.index}`,
          kind: 'anchor' as const,
          edgeId,
          index: handle.index,
          point: handle.point,
          active: state.activeRouteIndex === handle.index
        }]
      }

      if (handle.kind === 'insert') {
        return [{
          key: `${edgeId}:insert:${handle.insertIndex}`,
          kind: 'insert' as const,
          edgeId,
          insertIndex: handle.insertIndex,
          point: handle.point,
          active: false as const
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
