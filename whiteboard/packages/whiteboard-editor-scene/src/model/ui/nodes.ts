import { family } from '@shared/core'
import { idDelta } from '@shared/delta'
import type {
  NodeId
} from '@whiteboard/core/types'
import type {
  NodeUiView
} from '../../contracts/editor'
import type { UiContext } from './context'
import {
  buildNodeUiView,
  isNodeUiViewEqual
} from './equality'

const buildCurrentNodeUiView = (input: {
  context: UiContext
  nodeId: NodeId
  previous: NodeUiView | undefined
}): NodeUiView | undefined => {
  const graph = input.context.working.graph.nodes.get(input.nodeId)
  if (!graph) {
    return undefined
  }

  const next = buildNodeUiView({
    nodeId: input.nodeId,
    preview: input.context.current.runtime.session.preview.nodes.get(input.nodeId),
    draw: input.context.current.runtime.session.preview.draw,
    edit: input.context.current.runtime.session.edit,
    selection: input.context.current.runtime.interaction.selection,
    hover: input.context.current.runtime.interaction.hover
  })

  return input.previous && isNodeUiViewEqual(input.previous, next)
    ? input.previous
    : next
}

const writeNodeDelta = (input: {
  context: UiContext
  nodeId: NodeId
  previous: NodeUiView | undefined
  next: NodeUiView | undefined
}) => {
  if (input.previous === input.next) {
    return
  }

  if (input.previous === undefined && input.next !== undefined) {
    idDelta.add(input.context.working.phase.ui.node, input.nodeId)
    return
  }
  if (input.previous !== undefined && input.next === undefined) {
    idDelta.remove(input.context.working.phase.ui.node, input.nodeId)
    return
  }

  idDelta.update(input.context.working.phase.ui.node, input.nodeId)
}

export const patchUiNodes = (
  context: UiContext
): number => {
  if (!context.reset && context.touched.node.size === 0) {
    return 0
  }

  const previous = context.working.ui.nodes
  if (context.reset) {
    const next = family.createMutableState<NodeId, NodeUiView>()
    let count = 0

    context.working.graph.nodes.forEach((_view, nodeId) => {
      const previousView = previous.get(nodeId)
      const nextView = buildCurrentNodeUiView({
        context,
        nodeId,
        previous: previousView
      })
      if (!nextView) {
        return
      }

      next.set(nodeId, nextView)
      writeNodeDelta({
        context,
        nodeId,
        previous: previousView,
        next: nextView
      })
      if (previousView !== nextView) {
        count += 1
      }
    })

    previous.forEach((previousView, nodeId) => {
      if (next.has(nodeId)) {
        return
      }

      writeNodeDelta({
        context,
        nodeId,
        previous: previousView,
        next: undefined
      })
      count += 1
    })

    context.working.ui.nodes = next
    context.working.graph.state.node = next
    return count
  }

  let count = 0
  context.touched.node.forEach((nodeId) => {
    const previousView = previous.get(nodeId)
    const nextView = buildCurrentNodeUiView({
      context,
      nodeId,
      previous: previousView
    })

    if (nextView === undefined) {
      if (previousView !== undefined) {
        previous.delete(nodeId)
        writeNodeDelta({
          context,
          nodeId,
          previous: previousView,
          next: undefined
        })
        count += 1
      }
      return
    }

    previous.set(nodeId, nextView)
    writeNodeDelta({
      context,
      nodeId,
      previous: previousView,
      next: nextView
    })
    if (previousView !== nextView) {
      count += 1
    }
  })

  context.working.graph.state.node = context.working.ui.nodes
  return count
}
