import type {
  EditorInput,
  EditorState
} from '#whiteboard-editor/types/editor'
import type { EditorQueryRead } from '#whiteboard-editor/query'
import type { EditorLocalRuntime } from '#whiteboard-editor/local/runtime'
import type { ContextMenuIntent } from '#whiteboard-editor/types/input'
import type { InteractionRuntime } from '#whiteboard-editor/input/core/types'
import type { EdgeHoverService } from '#whiteboard-editor/input/edge/hover'

const readSelectionIntent = (
  selection: EditorState['selection'],
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

export const createEditorInput = ({
  interaction,
  edgeHover,
  read,
  local
}: {
  interaction: InteractionRuntime
  edgeHover: EdgeHoverService
  read: EditorQueryRead
  local: Pick<EditorLocalRuntime, 'actions' | 'stores'>
}): EditorInput => {
  const writePointer = (input: {
    client: { x: number, y: number }
    screen: { x: number, y: number }
    world: { x: number, y: number }
  }) => {
    local.actions.viewport.pointer.set({
      client: input.client,
      screen: input.screen,
      world: input.world
    })
  }

  const clearPointer = () => {
    local.actions.viewport.pointer.clear()
  }

  const clearTransientState = () => {
    clearPointer()
    edgeHover.clear()
  }

  return {
    cancel: () => {
      clearTransientState()
      interaction.cancel()
    },
    contextMenu: (input) => {
      writePointer(input)
      edgeHover.clear()

      if (interaction.busy.get() || input.ignoreContextMenu) {
        return null
      }

      switch (input.pick.kind) {
        case 'selection-box': {
          return readSelectionIntent(local.stores.selection, input.screen) ?? {
            kind: 'canvas',
            screen: input.screen,
            world: input.world
          }
        }
        case 'node': {
          const current = local.stores.selection.get()
          const reuseCurrentSelection = current.nodeIds.includes(input.pick.id)
          if (reuseCurrentSelection) {
            return readSelectionIntent(local.stores.selection, input.screen)
          }

          local.actions.session.selection.replace({
            nodeIds: [input.pick.id]
          })
          return readSelectionIntent(local.stores.selection, input.screen)
        }
        case 'group': {
          const target = read.group.target(input.pick.id)
          if (!target) {
            return {
              kind: 'canvas',
              screen: input.screen,
              world: input.world
            }
          }

          local.actions.session.selection.replace(target)
          return readSelectionIntent(local.stores.selection, input.screen)
        }
        case 'edge':
          local.actions.session.selection.replace({
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
      writePointer(input)

      const handled = interaction.handlePointerDown(input)
      if (handled) {
        edgeHover.clear()
      }

      return {
        handled,
        continuePointer: handled && interaction.busy.get()
      }
    },
    pointerMove: (input) => {
      writePointer(input)
      const handled = interaction.handlePointerMove(input)
      if (!handled) {
        edgeHover.move(input.world)
      }
      return handled
    },
    pointerUp: (input) => {
      writePointer(input)
      return interaction.handlePointerUp(input)
    },
    pointerCancel: (input) => {
      clearTransientState()
      return interaction.handlePointerCancel(input)
    },
    pointerLeave: () => {
      clearTransientState()
      interaction.handlePointerLeave()
    },
    wheel: (input) => {
      writePointer(input)

      if (interaction.handleWheel(input)) {
        return true
      }

      local.actions.viewport.viewport.wheel(
        {
          deltaX: input.deltaX,
          deltaY: input.deltaY,
          ctrlKey: input.modifiers.ctrl,
          metaKey: input.modifiers.meta,
          clientX: input.client.x,
          clientY: input.client.y
        },
        1
      )
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
