import type {
  EditorCommandContext
} from '@whiteboard/editor/command/context'
import type {
  EditorCommandRunner,
  EditorCommandTree
} from '@whiteboard/editor/command/contracts'
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

export type EditorInputCommands = EditorCommandTree<
  EditorCommandContext,
  EditorInputHost
>

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

export const createEditorInputCommands = ({
  host
}: {
  host: EditorInputHost
}): EditorInputCommands => ({
  contextMenu: function* (_ctx, input) {
    return host.contextMenu(input)
  },
  pointerDown: function* (_ctx, input) {
    return host.pointerDown(input)
  },
  pointerMove: function* (_ctx, input) {
    return host.pointerMove(input)
  },
  pointerUp: function* (_ctx, input) {
    return host.pointerUp(input)
  },
  pointerCancel: function* (_ctx, input) {
    return host.pointerCancel(input)
  },
  pointerLeave: function* (_ctx) {
    host.pointerLeave()
  },
  wheel: function* (_ctx, input) {
    return host.wheel(input)
  },
  cancel: function* (_ctx) {
    host.cancel()
  },
  keyDown: function* (_ctx, input) {
    return host.keyDown(input)
  },
  keyUp: function* (_ctx, input) {
    return host.keyUp(input)
  },
  blur: function* (_ctx) {
    host.blur()
  }
})

export const bindEditorInputHost = ({
  runner,
  commands
}: {
  runner: Pick<EditorCommandRunner<EditorCommandContext>, 'bind'>
  commands: EditorInputCommands
}): EditorInputHost => ({
  contextMenu: runner.bind(commands.contextMenu),
  pointerDown: runner.bind(commands.pointerDown),
  pointerMove: runner.bind(commands.pointerMove),
  pointerUp: runner.bind(commands.pointerUp),
  pointerCancel: runner.bind(commands.pointerCancel),
  pointerLeave: runner.bind(commands.pointerLeave),
  wheel: runner.bind(commands.wheel),
  cancel: runner.bind(commands.cancel),
  keyDown: runner.bind(commands.keyDown),
  keyUp: runner.bind(commands.keyUp),
  blur: runner.bind(commands.blur)
})
