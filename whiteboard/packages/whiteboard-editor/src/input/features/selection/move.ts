import { node as nodeApi, type Guide, type MoveStepResult } from '@whiteboard/core/node'
import type { SelectionTarget } from '@whiteboard/core/selection'
import {
  FINISH
} from '@whiteboard/editor/input/internals/result'
import type {
  InteractionSession
} from '@whiteboard/editor/input/core/types'
import { createMindmapDragSession, tryStartMindmapDragForNode } from '@whiteboard/editor/input/features/mindmap/drag'
import type {
  PointerDownInput
} from '@whiteboard/editor/api/input'
import type { SelectionMoveVisibility } from '@whiteboard/editor/input/features/selection/press'
import type { Editor } from '@whiteboard/editor/api/editor'
import type { EditorCommand } from '@whiteboard/editor/state/intents'
import {
  isPreviewEqual,
  replacePreviewEdgeInteraction,
  replacePreviewNodeInteraction,
  setPreviewSelection
} from '@whiteboard/editor/state/preview'

const toMoveNodePatches = (
  result: MoveStepResult
) => result.preview.nodes.map(({ id, position }) => ({
  id,
  patch: {
    position
  }
}))

const toMoveEdgePatches = (
  result: MoveStepResult
) => result.preview.edges.map(({ id, patch }) => ({
  id,
  patch: {
    route: patch.route,
    source: patch.source,
    target: patch.target
  }
}))

type MoveInteractionInput = {
  start: PointerDownInput
  target: SelectionTarget
  visibility: SelectionMoveVisibility
}

export const createMoveInteraction = (
  editor: Editor,
  input: MoveInteractionInput
): InteractionSession | null => {
  const pickedNodeId = (
    input.start.pick.kind === 'node'
    && (
      input.start.pick.part === 'body'
      || input.start.pick.part === 'field'
    )
    && input.target.edgeIds.length === 0
    && input.target.nodeIds.length === 1
    && input.target.nodeIds[0] === input.start.pick.id
  )
    ? input.start.pick.id
    : undefined
  const restoreSelection = input.visibility.kind === 'temporary'
    ? input.visibility.restore
    : undefined

  if (
    input.visibility.kind === 'show'
    || input.visibility.kind === 'temporary'
  ) {
    editor.dispatch({
      type: 'selection.set',
      selection: input.visibility.selection
    })
  }

  if (pickedNodeId) {
    const mindmapState = tryStartMindmapDragForNode({
      nodeId: pickedNodeId,
        pointerId: input.start.pointerId,
        world: input.start.world,
      mindmap: {
        tree: editor.scene.mindmaps.tree
      },
      node: editor.document.node
    })

    if (mindmapState) {
      const session = createMindmapDragSession(editor, mindmapState)
      const cleanup = session.cleanup
      session.cleanup = () => {
        cleanup?.()
        if (restoreSelection) {
          editor.dispatch({
            type: 'selection.set',
            selection: restoreSelection
          })
        }
      }

      return session
    }
  }

  const moveScope = editor.scene.selection.move(input.target)
  const initialState = nodeApi.move.state.start({
    nodes: moveScope.nodes,
    edges: moveScope.edges,
    target: input.target,
    startWorld: input.start.world
  })
  if (!initialState) {
    return null
  }
  let state = initialState
  let modifiers = input.start.modifiers

  const project = (nextInput: {
    world: {
      x: number
      y: number
    }
    modifiers: PointerDownInput['modifiers']
  }) => {
    modifiers = nextInput.modifiers
    let guides: readonly Guide[] = []
    const result = nodeApi.move.state.step({
      state,
      pointerWorld: nextInput.world,
      snap: editor.scene.ui.state.tool.is('select')
        ? ({ rect, excludeIds }) => {
            const snapped = editor.runtime.snap.node.move({
              rect,
              excludeIds,
              modifiers: nextInput.modifiers
            })
            guides = snapped.guides
            return snapped.rect
          }
        : undefined
    })

    state = result.state
    editor.dispatch((snapshot) => {
      const current = snapshot.overlay.preview
      const nextPreview = setPreviewSelection(
        replacePreviewEdgeInteraction(
          replacePreviewNodeInteraction(current, {
            patches: toMoveNodePatches(result)
          }),
          toMoveEdgePatches(result)
        ),
        {
          guides
        }
      )

      return isPreviewEqual(current, nextPreview)
        ? null
        : {
            type: 'overlay.preview.set',
            preview: nextPreview
          } satisfies EditorCommand
    })
  }

  return {
    mode: 'node-drag',
    pointerId: input.start.pointerId,
    chrome: false,
    autoPan: {
      frame: (pointer) => {
        project({
          world: editor.runtime.viewport.pointer(pointer).world,
          modifiers
        })
      }
    },
    move: (next) => {
      project({
        world: next.world,
        modifiers: next.modifiers
      })
    },
    up: () => {
      const commit = nodeApi.move.state.finish(state)
      if (commit.delta) {
        editor.write.canvas.selection.move({
          nodeIds: input.target.nodeIds,
          edgeIds: input.target.edgeIds,
          delta: commit.delta
        })
      }

      return FINISH
    },
    cleanup: () => {
      if (restoreSelection) {
        editor.dispatch({
          type: 'selection.set',
          selection: restoreSelection
        })
      }

      editor.dispatch((snapshot) => {
        const current = snapshot.overlay.preview
        const nextPreview = setPreviewSelection(
          replacePreviewEdgeInteraction(
            replacePreviewNodeInteraction(current, {}),
            []
          ),
          {
            guides: []
          }
        )
        return isPreviewEqual(current, nextPreview)
          ? null
          : {
              type: 'overlay.preview.set',
              preview: nextPreview
            } satisfies EditorCommand
      })
    }
  }
}
