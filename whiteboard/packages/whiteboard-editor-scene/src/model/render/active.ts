import { equal } from '@shared/core'
import { idDelta } from '@shared/delta'
import { edge as edgeApi } from '@whiteboard/core/edge'
import type { EdgeId } from '@whiteboard/core/types'
import type { EdgeActiveView, EdgeStaticView } from '../../contracts/render'
import type { RenderContext } from './context'
import { reconcileFamilyReset, reconcileFamilyTouched } from '../reconcile'

const isStaticStyleEqual = (
  left: EdgeStaticView['style'],
  right: EdgeStaticView['style']
): boolean => (
  left.color === right.color
  && left.width === right.width
  && left.opacity === right.opacity
  && left.dash === right.dash
  && left.start === right.start
  && left.end === right.end
)

const isActiveViewEqual = (
  left: EdgeActiveView,
  right: EdgeActiveView
): boolean => (
  left.edgeId === right.edgeId
  && left.svgPath === right.svgPath
  && isStaticStyleEqual(left.style, right.style)
  && left.box?.pad === right.box?.pad
  && equal.sameOptionalRect(left.box?.rect, right.box?.rect)
  && left.state.hovered === right.state.hovered
  && left.state.selected === right.state.selected
  && left.state.editing === right.state.editing
)

const buildActiveView = (input: {
  context: RenderContext
  edgeId: EdgeId
}): EdgeActiveView | undefined => {
  const edge = input.context.working.graph.edges.get(input.edgeId)
  if (!edge?.route.svgPath) {
    return undefined
  }

  return {
    edgeId: input.edgeId,
    svgPath: edge.route.svgPath,
    style: edgeApi.render.staticStyle(edge.base.edge.style),
    box: edge.box,
    state: {
      hovered: input.context.working.runtime.editor.interaction.hover.kind === 'edge'
        && input.context.working.runtime.editor.interaction.hover.edgeId === input.edgeId,
      selected: input.context.working.runtime.editor.interaction.selection.edgeIds.includes(input.edgeId),
      editing: input.context.working.ui.edges.get(input.edgeId)?.editingLabelId !== undefined
    }
  }
}

const writeActiveDelta = (input: {
  context: RenderContext
  edgeId: EdgeId
  previous: EdgeActiveView | undefined
  next: EdgeActiveView | undefined
}) => {
  if (input.previous === input.next) {
    return
  }

  if (input.previous === undefined && input.next !== undefined) {
    idDelta.add(input.context.working.phase.render.edge.active, input.edgeId)
    input.context.working.phase.render.edge.activeIds = true
    return
  }
  if (input.previous !== undefined && input.next === undefined) {
    idDelta.remove(input.context.working.phase.render.edge.active, input.edgeId)
    input.context.working.phase.render.edge.activeIds = true
    return
  }

  idDelta.update(input.context.working.phase.render.edge.active, input.edgeId)
}

export const patchRenderActive = (
  context: RenderContext
): number => {
  if (!context.reset && context.touched.edge.active.size === 0) {
    return 0
  }

  if (context.reset) {
    return reconcileFamilyReset({
      previous: context.working.render.active,
      ids: context.active,
      build: (edgeId) => buildActiveView({
        context,
        edgeId
      }),
      equal: isActiveViewEqual,
      write: (next) => {
        context.working.render.active = next
      },
      writeDelta: (edgeId, previous, next) => {
        writeActiveDelta({
          context,
          edgeId,
          previous,
          next
        })
      }
    })
  }

  return reconcileFamilyTouched({
    state: context.working.render.active,
    ids: context.touched.edge.active,
    build: (edgeId) => context.active.has(edgeId)
      ? buildActiveView({
          context,
          edgeId
        })
      : undefined,
    equal: isActiveViewEqual,
    writeDelta: (edgeId, previous, next) => {
      writeActiveDelta({
        context,
        edgeId,
        previous,
        next
      })
    }
  })
}
