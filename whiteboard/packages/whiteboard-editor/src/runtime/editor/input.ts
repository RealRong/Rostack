import type { Editor, EditorWriteApi } from '../../types/editor'
import type { InteractionRuntime } from '../interaction/types'
import type { EdgeHoverService } from '../../interactions/edge/hover'

export const createEditorInput = ({
  interaction,
  edgeHover,
  write
}: {
  interaction: InteractionRuntime
  edgeHover: EdgeHoverService
  write: EditorWriteApi
}): Editor['input'] => {
  const writePointer = (input: {
    client: { x: number, y: number }
    screen: { x: number, y: number }
    world: { x: number, y: number }
  }) => {
    write.view.pointer.set({
      client: input.client,
      screen: input.screen,
      world: input.world
    })
  }

  const clearPointer = () => {
    write.view.pointer.clear()
  }

  return {
    cancel: () => {
      clearPointer()
      edgeHover.clear()
      interaction.cancel()
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
      clearPointer()
      edgeHover.clear()
      return interaction.handlePointerCancel(input)
    },
    pointerLeave: () => {
      clearPointer()
      edgeHover.clear()
      interaction.handlePointerLeave()
    },
    wheel: (input) => {
      writePointer(input)

      if (interaction.handleWheel(input)) {
        return true
      }

      write.view.viewport.wheel(
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
      clearPointer()
      edgeHover.clear()
      interaction.handleBlur()
    }
  }
}
