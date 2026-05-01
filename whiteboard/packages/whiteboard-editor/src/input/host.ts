import type { SelectionTarget } from '@whiteboard/core/selection'
import type { EditorProjection } from '@whiteboard/editor/editor/projection/types'
import type { EditorCommand } from '@whiteboard/editor/state-engine/intents'
import type { ContextMenuIntent } from '@whiteboard/editor/types/input'
import type { EditorInputHost } from '@whiteboard/editor/types/editor'
import type { InteractionRuntime } from '@whiteboard/editor/input/core/types'
import type { EdgeHoverService } from '@whiteboard/editor/input/hover/edge'
import type { EditorHostDeps } from '@whiteboard/editor/input/runtime'
import {
  EMPTY_HOVER_STATE,
  isHoverStateEqual,
  toHoverStateFromPick
} from '@whiteboard/editor/input/hover/store'

const readSelectionIntent = (
  selection: {
    get: () => SelectionTarget
  },
  screen: {
    x: number
    y: number
  }
): Extract<ContextMenuIntent, { kind: 'selection' }> | null => {
  const target = selection.get()

  return target.nodeIds.length > 0 || target.edgeIds.length > 0
    ? {
        kind: 'selection',
        screen
      }
    : null
}

export const createEditorInputHost = ({
  interaction,
  edgeHover,
  projection,
  read,
  runtime
}: {
  interaction: InteractionRuntime
  edgeHover: EdgeHoverService
  projection: EditorProjection
  read: EditorHostDeps['read']
  runtime: EditorHostDeps['runtime']
}): EditorInputHost => {
  const dispatchSelection = (
    selection: {
      nodeIds?: readonly string[]
      edgeIds?: readonly string[]
    }
  ) => {
    runtime.dispatch({
      type: 'selection.set',
      selection: {
        nodeIds: selection.nodeIds ? [...selection.nodeIds] : [],
        edgeIds: selection.edgeIds ? [...selection.edgeIds] : []
      }
    } satisfies EditorCommand)
  }

  const updateInteraction = (
    update: (
      current: ReturnType<EditorHostDeps['read']['interaction']['hover']['get']>
    ) => ReturnType<EditorHostDeps['read']['interaction']['hover']['get']>
  ) => {
    runtime.dispatch({
      type: 'overlay.hover.set',
      hover: update(read.interaction.hover.get())
    } satisfies EditorCommand)
  }

  const dispatchViewport = (
    viewport: ReturnType<EditorHostDeps['runtime']['viewport']['read']['get']>
  ) => {
    runtime.dispatch({
      type: 'viewport.set',
      viewport
    } satisfies EditorCommand)
  }

  const clearTransientState = () => {
    runtime.dispatch({
      type: 'overlay.hover.set',
      hover: EMPTY_HOVER_STATE
    } satisfies EditorCommand)
    edgeHover.clear()
  }

  return {
    pointerMode: interaction.pointerMode,
    cancel: () => {
      clearTransientState()
      interaction.cancel()
    },
    contextMenu: (input) => {
      edgeHover.clear()

      if (read.interaction.busy.get() || input.ignoreContextMenu) {
        return null
      }

      switch (input.pick.kind) {
        case 'selection-box': {
          return readSelectionIntent(read.selection, input.screen) ?? {
            kind: 'canvas',
            screen: input.screen,
            world: input.world
          }
        }
        case 'node': {
          const current = read.selection.get()
          const reuseCurrentSelection = current.nodeIds.includes(input.pick.id)
          if (reuseCurrentSelection) {
            return readSelectionIntent(read.selection, input.screen)
          }

          dispatchSelection({
            nodeIds: [input.pick.id]
          })
          return readSelectionIntent(read.selection, input.screen)
        }
        case 'group': {
          const target = projection.groups.target(input.pick.id)
          if (!target) {
            return {
              kind: 'canvas',
              screen: input.screen,
              world: input.world
            }
          }

          dispatchSelection(target)
          return readSelectionIntent(read.selection, input.screen)
        }
        case 'edge':
          dispatchSelection({
            edgeIds: [input.pick.id]
          })
          return {
            kind: 'edge',
            screen: input.screen,
            edgeId: input.pick.id
          }
        case 'background':
        case 'mindmap':
          return {
            kind: 'canvas',
            screen: input.screen,
            world: input.world
          }
      }
    },
    pointerDown: (input) => {
      const handled = interaction.handlePointerDown(input)
      if (handled) {
        updateInteraction(() => EMPTY_HOVER_STATE)
        edgeHover.clear()
      }

      return {
        handled,
        continuePointer: handled && read.interaction.busy.get()
      }
    },
    pointerMove: (input) => {
      const handled = interaction.handlePointerMove(input)
      if (handled) {
        updateInteraction(() => EMPTY_HOVER_STATE)
        edgeHover.clear()
        return true
      }

      const target = toHoverStateFromPick(input.pick)
      updateInteraction((current) => (
        isHoverStateEqual(current, target)
          ? current
          : target
      ))

      if (read.tool.get().type === 'edge') {
        edgeHover.move(input.world)
      } else {
        edgeHover.clear()
      }
      return false
    },
    pointerUp: (input) => interaction.handlePointerUp(input),
    pointerCancel: (input) => {
      clearTransientState()
      return interaction.handlePointerCancel(input)
    },
    pointerLeave: () => {
      clearTransientState()
      interaction.handlePointerLeave()
    },
    wheel: (input) => {
      if (interaction.handleWheel(input)) {
        return true
      }

      dispatchViewport(runtime.viewport.resolve.wheel(
        {
          deltaX: input.deltaX,
          deltaY: input.deltaY,
          ctrlKey: input.modifiers.ctrl,
          metaKey: input.modifiers.meta,
          clientX: input.client.x,
          clientY: input.client.y
        },
        1
      ))
      return true
    },
    keyDown: (input) => interaction.handleKeyDown(input),
    keyUp: (input) => interaction.handleKeyUp(input),
    blur: () => {
      clearTransientState()
      interaction.handleBlur()
    }
  }
}
