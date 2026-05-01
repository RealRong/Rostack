import { equal } from '@shared/core'
import { idDelta } from '@shared/delta'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type { NodeId } from '@whiteboard/core/types'
import type { EdgeLabelView, NodeRenderView } from '../../contracts/render'
import type { RenderContext } from './context'
import { reconcileFamilyReset, reconcileFamilyTouched } from '../reconcile'

const isEditCaretEqual = (
  left: EdgeLabelView['caret'],
  right: EdgeLabelView['caret']
): boolean => left?.kind === right?.kind && (
  left?.kind !== 'point'
  || (
    right?.kind === 'point'
    && geometryApi.equal.point(left.client, right.client)
  )
)

const isNodeRenderViewEqual = (
  left: NodeRenderView,
  right: NodeRenderView
): boolean => (
  left.id === right.id
  && left.node === right.node
  && left.owner?.kind === right.owner?.kind
  && left.owner?.id === right.owner?.id
  && equal.sameRect(left.rect, right.rect)
  && equal.sameRect(left.bounds, right.bounds)
  && left.rotation === right.rotation
  && left.outline === right.outline
  && equal.sameOptionalPoint(left.presentation?.position, right.presentation?.position)
  && left.state.hidden === right.state.hidden
  && left.state.selected === right.state.selected
  && left.state.hovered === right.state.hovered
  && left.state.editing === right.state.editing
  && left.state.patched === right.state.patched
  && left.state.resizing === right.state.resizing
  && left.edit?.field === right.edit?.field
  && isEditCaretEqual(left.edit?.caret, right.edit?.caret)
)

const buildNodeRenderView = (
  context: RenderContext,
  nodeId: NodeId
): NodeRenderView | undefined => {
  const graph = context.working.graph.nodes.get(nodeId)
  if (!graph) {
    return undefined
  }

  const state = context.working.ui.nodes.get(nodeId)
  const presentation = context.current.editor.snapshot.overlay.preview.nodes[nodeId]?.presentation

  return {
    id: nodeId,
    node: graph.base.node,
    owner: graph.base.owner,
    rect: graph.geometry.rect,
    bounds: graph.geometry.bounds,
    rotation: graph.geometry.rotation,
    outline: graph.geometry.outline,
    presentation,
    state: {
      hidden: state?.hidden ?? false,
      selected: state?.selected ?? false,
      hovered: state?.hovered ?? false,
      editing: state?.editing ?? false,
      patched: state?.patched ?? false,
      resizing: state?.resizing ?? false
    },
    edit: state?.edit
  }
}

const writeNodeDelta = (input: {
  context: RenderContext
  nodeId: NodeId
  previous: NodeRenderView | undefined
  next: NodeRenderView | undefined
}) => {
  if (input.previous === input.next) {
    return
  }

  if (input.previous === undefined && input.next !== undefined) {
    idDelta.add(input.context.working.phase.render.node, input.nodeId)
    return
  }
  if (input.previous !== undefined && input.next === undefined) {
    idDelta.remove(input.context.working.phase.render.node, input.nodeId)
    return
  }

  idDelta.update(input.context.working.phase.render.node, input.nodeId)
}

export const patchRenderNodes = (
  context: RenderContext
): number => {
  if (!context.reset && context.touched.node.size === 0) {
    return 0
  }

  if (context.reset) {
    return reconcileFamilyReset({
      previous: context.working.render.node,
      ids: context.working.graph.nodes.keys(),
      build: (nodeId) => buildNodeRenderView(context, nodeId),
      equal: isNodeRenderViewEqual,
      write: (next) => {
        context.working.render.node = next
      },
      writeDelta: (nodeId, previous, next) => {
        writeNodeDelta({
          context,
          nodeId,
          previous,
          next
        })
      }
    })
  }

  return reconcileFamilyTouched({
    state: context.working.render.node,
    ids: context.touched.node,
    build: (nodeId) => buildNodeRenderView(context, nodeId),
    equal: isNodeRenderViewEqual,
    writeDelta: (nodeId, previous, next) => {
      writeNodeDelta({
        context,
        nodeId,
        previous,
        next
      })
    }
  })
}
