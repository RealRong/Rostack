import type {
  EditorInput,
  EditorRead,
  EditorState
} from '../../types/editor'
import type { EditorCommands } from '../commands'
import type { ContextMenuIntent } from '../../types/input'
import type { InteractionRuntime } from '../interaction/types'
import type { EdgeHoverService } from '../../interactions/edge/hover'
import {
  sameOrder as isSameIds
} from '@shared/core'

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

const syncNodeSelection = (
  selection: EditorState['selection'],
  write: EditorCommands,
  nodeIds: readonly string[]
) => {
  const current = selection.get()
  if (isSameIds(current.nodeIds, nodeIds) && current.edgeIds.length === 0) {
    return
  }

  write.session.selection.replace({
    nodeIds
  })
}

const syncSingleEdgeSelection = (
  selection: EditorState['selection'],
  write: EditorCommands,
  edgeId: string
) => {
  const current = selection.get()
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
  write,
  selection
}: {
  interaction: InteractionRuntime
  edgeHover: EdgeHoverService
  read: EditorRead
  write: EditorCommands
  selection: EditorState['selection']
}): EditorInput => {
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
          return readSelectionIntent(selection, input.screen) ?? {
            kind: 'canvas',
            screen: input.screen,
            world: input.world
          }
        }
        case 'node': {
          const current = selection.get()
          const reuseCurrentSelection = current.nodeIds.includes(input.pick.id)
          if (reuseCurrentSelection) {
            return readSelectionIntent(selection, input.screen)
          }

          syncNodeSelection(selection, write, [input.pick.id])
          return readSelectionIntent(selection, input.screen)
        }
        case 'group': {
          const target = readGroupSelection(read, input.pick.id)
          if (!target) {
            return {
              kind: 'canvas',
              screen: input.screen,
              world: input.world
            }
          }

          write.session.selection.replace(target)
          return readSelectionIntent(selection, input.screen)
        }
        case 'edge':
          syncSingleEdgeSelection(selection, write, input.pick.id)
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
