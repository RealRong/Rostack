import { node as nodeApi, type Guide, type MoveStepResult } from '@whiteboard/core/node'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type { EdgeId, NodeId } from '@whiteboard/core/types'
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
    editor.state.write(({
      writer,
      snapshot
    }) => {
      const nextNodeById = new Map<NodeId, {
        position: {
          x: number
          y: number
        }
      }>(
        toMoveNodePatches(result).map((entry) => [
          entry.id,
          entry.patch
        ])
      )
      const nextEdgeById = new Map<EdgeId, typeof result.preview.edges[number]['patch']>(
        toMoveEdgePatches(result).map((entry) => [
          entry.id,
          entry.patch
        ])
      )

      Object.keys(snapshot.preview.node).forEach((nodeId) => {
        const id = nodeId as NodeId
        const current = snapshot.preview.node[id]
        const nextPatch = nextNodeById.get(id)
        nextNodeById.delete(id)

        if (!current?.presentation && !nextPatch) {
          writer.preview.node.delete(id)
          return
        }

        if (!current) {
          if (!nextPatch) {
            return
          }

          writer.preview.node.create({
            id,
            patch: nextPatch,
            hovered: false,
            hidden: false
          })
          return
        }

        if (!nextPatch && current.presentation === undefined) {
          writer.preview.node.delete(id)
          return
        }

        writer.preview.node.patch(id, {
          patch: nextPatch,
          presentation: current.presentation,
          hovered: false,
          hidden: false
        })
      })

      nextNodeById.forEach((patch, id) => {
        writer.preview.node.create({
          id,
          patch,
          hovered: false,
          hidden: false
        })
      })

      Object.keys(snapshot.preview.edge).forEach((edgeId) => {
        const id = edgeId as EdgeId
        const nextPatch = nextEdgeById.get(id)
        nextEdgeById.delete(id)

        if (!nextPatch) {
          writer.preview.edge.delete(id)
          return
        }

        writer.preview.edge.patch(id, {
          patch: nextPatch,
          activeRouteIndex: undefined
        })
      })

      nextEdgeById.forEach((patch, id) => {
        writer.preview.edge.create({
          id,
          patch
        })
      })

      writer.preview.selection.patch(
        {
          marquee: undefined,
          guides
        }
      )
    })
  }

  return {
    mode: 'node-drag',
    pointerId: input.start.pointerId,
    chrome: false,
    autoPan: {
      frame: (pointer) => {
        project({
          world: editor.viewport.pointer(pointer).world,
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

      editor.state.write(({
        writer,
        snapshot
      }) => {
        Object.keys(snapshot.preview.node).forEach((nodeId) => {
          const id = nodeId as NodeId
          const current = snapshot.preview.node[id]
          if (!current?.presentation) {
            writer.preview.node.delete(id)
            return
          }

          writer.preview.node.patch(id, {
            patch: undefined,
            presentation: current.presentation,
            hovered: false,
            hidden: false
          })
        })
        Object.keys(snapshot.preview.edge).forEach((edgeId) => {
          writer.preview.edge.delete(edgeId as EdgeId)
        })
        writer.preview.selection.patch(
          {
            marquee: undefined,
            guides: []
          }
        )
      })
    }
  }
}
