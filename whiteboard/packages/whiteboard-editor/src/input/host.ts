import type { SelectionTarget } from '@whiteboard/core/selection'
import type { EditorInputHost, EditorProjection } from '@whiteboard/editor/types/editor'
import type { EditorCommand } from '@whiteboard/editor/state-engine/intents'
import type { ContextMenuIntent } from '@whiteboard/editor/types/input'
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
  session
}: {
  interaction: InteractionRuntime
  edgeHover: EdgeHoverService
  projection: EditorProjection
  session: EditorHostDeps['session']
}): EditorInputHost => {
  const dispatchSelection = (
    selection: {
      nodeIds?: readonly string[]
      edgeIds?: readonly string[]
    }
  ) => {
    session.dispatch({
      type: 'selection.set',
      selection: {
        nodeIds: selection.nodeIds ? [...selection.nodeIds] : [],
        edgeIds: selection.edgeIds ? [...selection.edgeIds] : []
      }
    } satisfies EditorCommand)
  }

  const updateInteraction = (
    update: (
      current: ReturnType<EditorHostDeps['session']['interaction']['read']['hover']['get']>
    ) => ReturnType<EditorHostDeps['session']['interaction']['read']['hover']['get']>
  ) => {
    const currentInteraction = {
      mode: session.interaction.read.mode.get(),
      chrome: session.interaction.read.chrome.get(),
      space: session.interaction.read.space.get(),
      hover: session.interaction.read.hover.get()
    }

    session.dispatch({
      type: 'interaction.set',
      interaction: {
        ...currentInteraction,
        hover: update(currentInteraction.hover)
      }
    } satisfies EditorCommand)
  }

  const dispatchViewport = (
    viewport: ReturnType<EditorHostDeps['session']['viewport']['read']['get']>
  ) => {
    session.dispatch({
      type: 'viewport.set',
      viewport
    } satisfies EditorCommand)
  }

  const writePointer = (sample: {
    client: { x: number, y: number }
    screen: { x: number, y: number }
    world: { x: number, y: number }
  }) => {
    session.transient.setPointer({
      client: sample.client,
      screen: sample.screen,
      world: sample.world
    })
  }

  const clearPointer = () => {
    session.transient.setPointer(null)
  }

  const clearTransientState = () => {
    clearPointer()
    const currentInteraction = {
      mode: session.interaction.read.mode.get(),
      chrome: session.interaction.read.chrome.get(),
      space: session.interaction.read.space.get(),
      hover: session.interaction.read.hover.get()
    }
    session.dispatch({
      type: 'interaction.set',
      interaction: {
        ...currentInteraction,
        hover: EMPTY_HOVER_STATE
      }
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

          dispatchSelection({
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

          dispatchSelection(target)
          return readSelectionIntent(session.state.selection, input.screen)
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
      writePointer(input)

      const handled = interaction.handlePointerDown(input)
      if (handled) {
        updateInteraction(() => EMPTY_HOVER_STATE)
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

      dispatchViewport(session.viewport.resolve.wheel(
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
