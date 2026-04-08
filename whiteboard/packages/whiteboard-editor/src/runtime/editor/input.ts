import type {
  Editor,
  EditorRead,
  EditorWriteApi
} from '../../types/editor'
import type { ContextMenuIntent } from '../../types/input'
import type { InteractionRuntime } from '../interaction/types'
import type { EdgeHoverService } from '../../interactions/edge/hover'

const isSameIds = (
  left: readonly string[],
  right: readonly string[]
) => (
  left.length === right.length
  && left.every((value, index) => value === right[index])
)

const readSelectionIntent = (
  read: EditorRead,
  screen: {
    x: number
    y: number
  }
): Extract<ContextMenuIntent, { kind: 'selection' }> | null => {
  const selection = read.selection.summary.get()

  return selection.items.count > 0
    ? {
        kind: 'selection',
        screen
      }
    : null
}

const syncNodeSelection = (
  read: EditorRead,
  write: EditorWriteApi,
  nodeIds: readonly string[]
) => {
  const current = read.selection.target.get()
  if (isSameIds(current.nodeIds, nodeIds) && current.edgeIds.length === 0) {
    return
  }

  write.session.selection.replace({
    nodeIds
  })
}

const syncSingleEdgeSelection = (
  read: EditorRead,
  write: EditorWriteApi,
  edgeId: string
) => {
  const current = read.selection.target.get()
  if (
    current.nodeIds.length === 0
    && current.edgeIds.length === 1
    && current.edgeIds[0] === edgeId
  ) {
    return
  }

  write.session.selection.replace({
    edgeIds: [edgeId]
  })
}

const readGroupSelection = (
  read: EditorRead,
  groupId: string
) => {
  const nodeIds = read.group.nodeIds(groupId)
  const edgeIds = read.group.edgeIds(groupId)

  return nodeIds.length > 0 || edgeIds.length > 0
    ? {
        nodeIds,
        edgeIds
      }
    : undefined
}

export const createEditorInput = ({
  interaction,
  edgeHover,
  read,
  write
}: {
  interaction: InteractionRuntime
  edgeHover: EdgeHoverService
  read: EditorRead
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
    contextMenu: (input) => {
      writePointer(input)
      edgeHover.clear()

      if (interaction.busy.get() || input.ignoreContextMenu) {
        return null
      }

      switch (input.pick.kind) {
        case 'selection-box': {
          return readSelectionIntent(read, input.screen) ?? {
            kind: 'canvas',
            screen: input.screen,
            world: input.world
          }
        }
        case 'node': {
          const selection = read.selection.summary.get()
          const reuseCurrentSelection = selection.target.nodeSet.has(input.pick.id)
          if (reuseCurrentSelection) {
            return readSelectionIntent(read, input.screen)
          }

          syncNodeSelection(read, write, [input.pick.id])
          return readSelectionIntent(read, input.screen)
        }
        case 'group': {
          const selection = readGroupSelection(read, input.pick.id)
          if (!selection) {
            return {
              kind: 'canvas',
              screen: input.screen,
              world: input.world
            }
          }

          write.session.selection.replace(selection)
          return readSelectionIntent(read, input.screen)
        }
        case 'edge':
          syncSingleEdgeSelection(read, write, input.pick.id)
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
