import type { WhiteboardLayoutService } from '@whiteboard/core/layout'
import type { Editor, EditorInputHost } from '@whiteboard/editor/api/editor'
import { createInteractionRuntime } from '@whiteboard/editor/input/core/runtime'
import { createDrawBinding } from '@whiteboard/editor/input/features/draw'
import { createEdgeBinding } from '@whiteboard/editor/input/features/edge'
import { createSelectionBinding } from '@whiteboard/editor/input/features/selection/press'
import { createTransformBinding } from '@whiteboard/editor/input/features/transform'
import { createViewportBinding } from '@whiteboard/editor/input/features/viewport'
import { createEdgeHoverService } from '@whiteboard/editor/input/hover/edge'
import {
  EMPTY_HOVER_STATE,
  isHoverStateEqual,
  toHoverStateFromPick
} from '@whiteboard/editor/input/hover/store'
import {
  isPreviewEqual
} from '@whiteboard/editor/state/preview'

export const createEditorInputHost = ({
  editor,
  layout
}: {
  editor: Editor
  layout: WhiteboardLayoutService
}): EditorInputHost => {
  const interaction = createInteractionRuntime({
    editor,
    bindings: [
      createViewportBinding(editor),
      createDrawBinding(editor),
      createEdgeBinding({
        editor,
        layout
      }),
      createTransformBinding({
        editor,
        layout
      }),
      createSelectionBinding(editor)
    ]
  })

  const edgeHover = createEdgeHoverService(
    {
      readTool: () => editor.state.read().state.tool,
      snap: editor.runtime.snap
    },
    {
      read: () => editor.state.read().preview.edgeGuide,
      write: (nextEdgeGuide) => {
        editor.state.write(({
          writer,
          snapshot
        }) => {
          if (isPreviewEqual(snapshot.preview, {
            ...snapshot.preview,
            edgeGuide: nextEdgeGuide
          })) {
            return
          }

          writer.preview.edgeGuide.set(nextEdgeGuide)
        })
      }
    }
  )

  const dispatchSelection = (
    selection: {
      nodeIds?: readonly string[]
      edgeIds?: readonly string[]
    }
  ) => {
    editor.actions.session.selection.replace({
      nodeIds: selection.nodeIds ? [...selection.nodeIds] : [],
      edgeIds: selection.edgeIds ? [...selection.edgeIds] : []
    })
  }

  const updateInteraction = (
    update: (current: ReturnType<typeof editor.state.read>['hover']) => ReturnType<typeof editor.state.read>['hover']
  ) => {
    editor.actions.session.hover.set(update(editor.state.read().hover))
  }

  const clearTransientState = () => {
    editor.actions.session.hover.set(EMPTY_HOVER_STATE)
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

      if (editor.scene.ui.state.interaction.get().busy || input.ignoreContextMenu) {
        return null
      }

      switch (input.pick.kind) {
        case 'selection-box': {
          const target = editor.scene.ui.state.selection.get()
          return (
            target.nodeIds.length > 0 || target.edgeIds.length > 0
              ? {
                  kind: 'selection',
                  screen: input.screen
                }
              : null
          ) ?? {
            kind: 'canvas',
            screen: input.screen,
            world: input.world
          }
        }
        case 'node': {
          const current = editor.scene.ui.state.selection.get()
          const reuseCurrentSelection = current.nodeIds.includes(input.pick.id)
          if (reuseCurrentSelection) {
            return {
              kind: 'selection',
              screen: input.screen
            }
          }

          dispatchSelection({
            nodeIds: [input.pick.id]
          })
          return {
            kind: 'selection',
            screen: input.screen
          }
        }
        case 'group': {
          const target = editor.scene.groups.target(input.pick.id)
          if (!target) {
            return {
              kind: 'canvas',
              screen: input.screen,
              world: input.world
            }
          }

          dispatchSelection(target)
          return {
            kind: 'selection',
            screen: input.screen
          }
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
        continuePointer: handled && editor.scene.ui.state.interaction.get().busy
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

      if (editor.scene.ui.state.tool.get().type === 'edge') {
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

      editor.actions.viewport.wheel({
        deltaX: input.deltaX,
        deltaY: input.deltaY,
        ctrlKey: input.modifiers.ctrl,
        metaKey: input.modifiers.meta,
        clientX: input.client.x,
        clientY: input.client.y
      })
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
