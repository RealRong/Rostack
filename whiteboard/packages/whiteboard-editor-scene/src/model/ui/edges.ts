import { family } from '@shared/core'
import { idDelta } from '@shared/delta'
import type {
  EdgeId
} from '@whiteboard/core/types'
import type {
  EdgeUiView
} from '../../contracts/editor'
import type { UiContext } from './context'
import {
  buildEdgeUiView,
  isEdgeUiViewEqual
} from './equality'

const buildCurrentEdgeUiView = (input: {
  context: UiContext
  edgeId: EdgeId
  previous: EdgeUiView | undefined
}): EdgeUiView | undefined => {
  const view = input.context.working.graph.edges.get(input.edgeId)
  if (!view) {
    return undefined
  }

  const next = buildEdgeUiView({
    edgeId: input.edgeId,
    entry: {
      base: {
        edge: view.base.edge,
        nodes: view.base.nodes
      },
      preview: input.context.current.editor.snapshot.overlay.preview.edges[input.edgeId]
    },
    view,
    edit: input.context.current.editor.snapshot.state.edit,
    selection: input.context.working.runtime.editor.interaction.selection
  })

  return input.previous && isEdgeUiViewEqual(input.previous, next)
    ? input.previous
    : next
}

const writeEdgeDelta = (input: {
  context: UiContext
  edgeId: EdgeId
  previous: EdgeUiView | undefined
  next: EdgeUiView | undefined
}) => {
  if (input.previous === input.next) {
    return
  }

  if (input.previous === undefined && input.next !== undefined) {
    idDelta.add(input.context.working.phase.ui.edge, input.edgeId)
    return
  }
  if (input.previous !== undefined && input.next === undefined) {
    idDelta.remove(input.context.working.phase.ui.edge, input.edgeId)
    return
  }

  idDelta.update(input.context.working.phase.ui.edge, input.edgeId)
}

export const patchUiEdges = (
  context: UiContext
): number => {
  if (!context.reset && context.touched.edge.size === 0) {
    return 0
  }

  const previous = context.working.ui.edges
  if (context.reset) {
    const next = family.createMutableState<EdgeId, EdgeUiView>()
    let count = 0

    context.working.graph.edges.forEach((_view, edgeId) => {
      const previousView = previous.get(edgeId)
      const nextView = buildCurrentEdgeUiView({
        context,
        edgeId,
        previous: previousView
      })
      if (!nextView) {
        return
      }

      next.set(edgeId, nextView)
      writeEdgeDelta({
        context,
        edgeId,
        previous: previousView,
        next: nextView
      })
      if (previousView !== nextView) {
        count += 1
      }
    })

    previous.forEach((previousView, edgeId) => {
      if (next.has(edgeId)) {
        return
      }

      writeEdgeDelta({
        context,
        edgeId,
        previous: previousView,
        next: undefined
      })
      count += 1
    })

    context.working.ui.edges = next
    context.working.graph.state.edge = next
    return count
  }

  let count = 0
  context.touched.edge.forEach((edgeId) => {
    const previousView = previous.get(edgeId)
    const nextView = buildCurrentEdgeUiView({
      context,
      edgeId,
      previous: previousView
    })

    if (nextView === undefined) {
      if (previousView !== undefined) {
        previous.delete(edgeId)
        writeEdgeDelta({
          context,
          edgeId,
          previous: previousView,
          next: undefined
        })
        count += 1
      }
      return
    }

    previous.set(edgeId, nextView)
    writeEdgeDelta({
      context,
      edgeId,
      previous: previousView,
      next: nextView
    })
    if (previousView !== nextView) {
      count += 1
    }
  })

  context.working.graph.state.edge = context.working.ui.edges
  return count
}
