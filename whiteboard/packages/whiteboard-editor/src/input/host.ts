import type {
  EditorInputHost,
  EditorState
} from '@whiteboard/editor/types/editor'
import type { EditorScene } from '@whiteboard/editor-scene'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { ContextMenuIntent } from '@whiteboard/editor/types/input'
import type { InteractionRuntime } from '@whiteboard/editor/input/core/types'
import type { EdgeHoverService } from '@whiteboard/editor/input/hover/edge'
import {
  isHoverTargetEqual,
  toHoverTargetFromPick
} from '@whiteboard/editor/input/hover/store'

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

export const createEditorInputHost = ({
  interaction,
  edgeHover,
  projection,
  session
}: {
  interaction: InteractionRuntime
  edgeHover: EdgeHoverService
  projection: EditorScene
  session: Pick<EditorSession, 'state' | 'viewport' | 'interaction' | 'commands'>
}): EditorInputHost => {
  const writePointer = (sample: {
    client: { x: number, y: number }
    screen: { x: number, y: number }
    world: { x: number, y: number }
  }) => {
    session.interaction.write.setPointer({
      client: sample.client,
      screen: sample.screen,
      world: sample.world
    })
  }

  const clearPointer = () => {
    session.interaction.write.setPointer(null)
  }

  const clearTransientState = () => {
    clearPointer()
    session.interaction.write.clearHover()
    edgeHover.clear()
  }

  return {
    pointerMode: interaction.pointerMode,
    cancel: () => {
      clearTransientState()
      interaction.cancel()
    },
    contextMenu: (input) => {
      writePointer(input)
      edgeHover.clear()

      if (session.interaction.read.busy.get() || input.ignoreContextMenu) {
        return null
      }

      switch (input.pick.kind) {
        case 'selection-box': {
          return readSelectionIntent(session.state.selection, input.screen) ?? {
            kind: 'canvas',
            screen: input.screen,
            world: input.world
          }
        }
        case 'node': {
          const current = session.state.selection.get()
          const reuseCurrentSelection = current.nodeIds.includes(input.pick.id)
          if (reuseCurrentSelection) {
            return readSelectionIntent(session.state.selection, input.screen)
          }

          session.commands.selection.replace({
            nodeIds: [input.pick.id]
          })
          return readSelectionIntent(session.state.selection, input.screen)
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

          session.commands.selection.replace(target)
          return readSelectionIntent(session.state.selection, input.screen)
        }
        case 'edge':
          session.commands.selection.replace({
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
        session.interaction.write.clearHover()
        edgeHover.clear()
      }

      return {
        handled,
        continuePointer: handled && session.interaction.read.busy.get()
      }
    },
    pointerMove: (input) => {
      writePointer(input)
      const handled = interaction.handlePointerMove(input)
      if (handled) {
        session.interaction.write.clearHover()
        edgeHover.clear()
        return true
      }

      const target = toHoverTargetFromPick(input.pick)
      session.interaction.write.setHover((current) => (
        isHoverTargetEqual(current.target, target)
          ? current
          : {
              ...current,
              target
            }
      ))

      if (session.state.tool.get().type === 'edge') {
        edgeHover.move(input.world)
      } else {
        edgeHover.clear()
      }
      return false
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

      session.viewport.input.wheel(
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
