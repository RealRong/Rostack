import type {
  EditorBoundaryRuntime
} from '@whiteboard/editor/boundary/runtime'
import type {
  EditorInputHost,
  EditorSessionState
} from '@whiteboard/editor/types/editor'
import type { EditorSceneRuntime } from '@whiteboard/editor/scene/source'
import {
  replaceSelection
} from '@whiteboard/editor/input/helpers'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { ContextMenuIntent } from '@whiteboard/editor/types/input'
import type { InteractionRuntime } from '@whiteboard/editor/input/core/types'
import type { EdgeHoverService } from '@whiteboard/editor/input/hover/edge'
import type {
  HoverTarget
} from '@whiteboard/editor/input/hover/store'
import type { EditorPick } from '@whiteboard/editor/types/pick'

const readSelectionIntent = (
  selection: EditorSessionState['selection'],
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

const isHoverTargetEqual = (
  left: HoverTarget | undefined,
  right: HoverTarget | undefined
): boolean => {
  if (left === right) {
    return true
  }
  if (!left || !right || left.kind !== right.kind) {
    return false
  }

  switch (left.kind) {
    case 'node':
      return right.kind === 'node' && left.nodeId === right.nodeId
    case 'edge':
      return right.kind === 'edge' && left.edgeId === right.edgeId
    case 'mindmap':
      return right.kind === 'mindmap' && left.mindmapId === right.mindmapId
    case 'group':
      return right.kind === 'group' && left.groupId === right.groupId
    case 'selection-box':
      return right.kind === 'selection-box'
  }
}

const readHoverTarget = (
  pick: EditorPick
): HoverTarget | undefined => {
  switch (pick.kind) {
    case 'background':
      return undefined
    case 'selection-box':
      return {
        kind: 'selection-box'
      }
    case 'node':
      return {
        kind: 'node',
        nodeId: pick.id
      }
    case 'edge':
      return {
        kind: 'edge',
        edgeId: pick.id
      }
    case 'group':
      return {
        kind: 'group',
        groupId: pick.id
      }
    case 'mindmap':
      return {
        kind: 'mindmap',
        mindmapId: pick.treeId
      }
  }
}

export const createEditorInputHost = ({
  interaction,
  edgeHover,
  projection,
  session
}: {
  interaction: InteractionRuntime
  edgeHover: EdgeHoverService
  projection: Pick<EditorSceneRuntime, 'group'>
  session: Pick<EditorSession, 'state' | 'mutate' | 'viewport' | 'interaction'>
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

          replaceSelection({
            session
          }, {
            nodeIds: [input.pick.id]
          })
          return readSelectionIntent(session.state.selection, input.screen)
        }
        case 'group': {
          const target = projection.group.target(input.pick.id)
          if (!target) {
            return {
              kind: 'canvas',
              screen: input.screen,
              world: input.world
            }
          }

          replaceSelection({
            session
          }, target)
          return readSelectionIntent(session.state.selection, input.screen)
        }
        case 'edge':
          replaceSelection({
            session
          }, {
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

      const target = readHoverTarget(input.pick)
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

export const createEditorInputApi = ({
  boundary,
  host
}: {
  boundary: Pick<EditorBoundaryRuntime, 'atomic'>
  host: EditorInputHost
}): EditorInputHost => ({
  pointerMode: host.pointerMode,
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
