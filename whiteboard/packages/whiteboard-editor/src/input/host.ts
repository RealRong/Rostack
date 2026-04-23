import type {
  EditorBoundaryRuntime
} from '@whiteboard/editor/boundary/runtime'
import type {
  EditorInputHost,
  EditorStore
} from '@whiteboard/editor/types/editor'
import type { DocumentRead } from '@whiteboard/editor/document/read'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { ContextMenuIntent } from '@whiteboard/editor/types/input'
import type { InteractionRuntime } from '@whiteboard/editor/input/core/types'
import type { EdgeHoverService } from '@whiteboard/editor/input/hover/edge'
import type { EditorInputOps } from '@whiteboard/editor/input/ops'

const readSelectionIntent = (
  selection: EditorStore['selection'],
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
  document,
  session,
  ops
}: {
  interaction: InteractionRuntime
  edgeHover: EdgeHoverService
  document: Pick<DocumentRead, 'group'>
  session: Pick<EditorSession, 'state' | 'viewport' | 'interaction'>
  ops: Pick<EditorInputOps, 'selection'>
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

          ops.selection.replace({
            nodeIds: [input.pick.id]
          })
          return readSelectionIntent(session.state.selection, input.screen)
        }
        case 'group': {
          const target = document.group.target(input.pick.id)
          if (!target) {
            return {
              kind: 'canvas',
              screen: input.screen,
              world: input.world
            }
          }

          ops.selection.replace(target)
          return readSelectionIntent(session.state.selection, input.screen)
        }
        case 'edge':
          ops.selection.replace({
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
        continuePointer: handled && session.interaction.read.busy.get()
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

export const createEditorInputApi = ({
  boundary,
  host
}: {
  boundary: Pick<EditorBoundaryRuntime, 'atomic'>
  host: EditorInputHost
}): EditorInputHost => ({
  contextMenu: boundary.atomic(host.contextMenu),
  pointerDown: boundary.atomic(host.pointerDown),
  pointerMove: boundary.atomic(host.pointerMove),
  pointerUp: boundary.atomic(host.pointerUp),
  pointerCancel: boundary.atomic(host.pointerCancel),
  pointerLeave: boundary.atomic(host.pointerLeave),
  wheel: boundary.atomic(host.wheel),
  cancel: boundary.atomic(host.cancel),
  keyDown: boundary.atomic(host.keyDown),
  keyUp: boundary.atomic(host.keyUp),
  blur: boundary.atomic(host.blur)
})
