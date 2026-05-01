import { scheduler } from '@shared/core'
import type { Point } from '@whiteboard/core/types'
import type { InteractionMode } from '@whiteboard/editor/input/core/types'
import type { SnapRuntime } from '@whiteboard/editor/input/core/snap'
import type { HoverState } from '@whiteboard/editor/input/hover/store'
import type { EditorCommand } from '@whiteboard/editor/state-engine/intents'
import type { Tool } from '@whiteboard/editor/types/tool'

export type EdgeHoverService = {
  move: (world: Point) => void
  clear: () => void
}

export const createEdgeHoverService = (
  ctx: {
    readTool: () => Tool
    snap: SnapRuntime
  },
  interaction: {
    read: () => {
      mode: InteractionMode
      chrome: boolean
      space: boolean
      hover: HoverState
    }
    dispatch: (command: EditorCommand | readonly EditorCommand[]) => void
  }
): EdgeHoverService => {
  let hoverPoint: Point | null = null

  const updateHover = (
    update: (current: HoverState) => HoverState
  ) => {
    const currentInteraction = interaction.read()
    const nextHover = update(currentInteraction.hover)
    if (nextHover === currentInteraction.hover) {
      return
    }

    interaction.dispatch({
      type: 'interaction.set',
      interaction: {
        ...currentInteraction,
        hover: nextHover
      }
    })
  }

  const hoverTask = scheduler.createFrameTask(() => {
    if (!hoverPoint || ctx.readTool().type !== 'edge') {
      updateHover((current) => (
        current.edgeGuide === undefined
          ? current
          : {
              ...current,
              edgeGuide: undefined
            }
      ))
      return
    }

    const evaluation = ctx.snap.edge.connect({
      pointerWorld: hoverPoint
    })
    const edgeGuide =
      evaluation.focusedNodeId || evaluation.resolution.mode !== 'free'
        ? {
            connect: {
              focusedNodeId: evaluation.focusedNodeId,
              resolution: evaluation.resolution
            }
          }
        : undefined
    updateHover((current) => (
      current.edgeGuide === edgeGuide
        ? current
        : {
            ...current,
            edgeGuide
          }
    ))
  })

  const clear = () => {
    hoverTask.cancel()
    hoverPoint = null
    updateHover((current) => (
      current.edgeGuide === undefined
        ? current
        : {
            ...current,
            edgeGuide: undefined
          }
    ))
  }

  return {
    move: (world) => {
      if (ctx.readTool().type !== 'edge') {
        clear()
        return
      }

      hoverPoint = world
      hoverTask.schedule()
    },
    clear
  }
}
