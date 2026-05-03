import { equal } from '@shared/core'
import {
  createMutationDelta,
  mergeMutationDeltas,
} from '@shared/mutation'
import {
  isCheckpointProgram,
  whiteboardMutationSchema
} from '@whiteboard/core/mutation'
import type { WhiteboardMutationDelta } from '@whiteboard/engine/mutation'
import type { Engine } from '@whiteboard/engine'
import type { EditorSceneRuntime } from '@whiteboard/editor-scene'
import { editorStateMutationSchema } from '@whiteboard/editor/state/model'
import {
  EMPTY_HOVER_STATE,
  isEditorHoverStateEqual
} from '@whiteboard/editor/state/document'
import type {
  EditorStateCommit,
  EditorStateMutationDelta,
  EditorStateRuntime,
} from '@whiteboard/editor/state/runtime'
import type { DocumentFrame } from '@whiteboard/editor-scene'

const EMPTY_DOCUMENT_DELTA = createMutationDelta(
  whiteboardMutationSchema
)
const EMPTY_EDITOR_DELTA = createMutationDelta(editorStateMutationSchema)

const resetEditorState = (
  state: EditorStateRuntime
) => {
  state.write(({
    writer,
    snapshot
  }) => {
    writer.edit.clear()
    writer.selection.clear()
    writer.interaction.clear()

    if (!isEditorHoverStateEqual(snapshot.hover, EMPTY_HOVER_STATE)) {
      writer.hover.clear()
    }

    writer.preview.reset()
  })
}

const reconcileEditorState = (input: {
  state: EditorStateRuntime
  document: Pick<DocumentFrame, 'node' | 'edge'>
}) => {
  input.state.write(({
    writer,
    snapshot
  }) => {
    const nextNodeIds = snapshot.state.selection.nodeIds.filter((id) => Boolean(
      input.document.node(id)
    ))
    const nextEdgeIds = snapshot.state.selection.edgeIds.filter((id) => Boolean(
      input.document.edge(id)
    ))

    if (
      !equal.sameOrder(nextNodeIds, snapshot.state.selection.nodeIds)
      || !equal.sameOrder(nextEdgeIds, snapshot.state.selection.edgeIds)
    ) {
      writer.selection.set({
        nodeIds: nextNodeIds,
        edgeIds: nextEdgeIds
      })
    }

    const edit = snapshot.state.edit
    const shouldClearEdit = Boolean(
      edit
      && (
        (edit.kind === 'node' && !input.document.node(edit.nodeId))
        || (edit.kind === 'edge-label' && !input.document.edge(edit.edgeId))
      )
    )

    if (shouldClearEdit) {
      writer.edit.clear()
    }
  })
}

type BufferedSceneCommit = {
  document: {
    snapshot: ReturnType<Engine['doc']>
    rev: ReturnType<Engine['rev']>
    delta: WhiteboardMutationDelta
  }
  editorDelta: EditorStateMutationDelta
}

const pushSceneUpdate = (input: {
  engine: Engine
  state: EditorStateRuntime
  scene: Pick<EditorSceneRuntime, 'update'>
  documentDelta: WhiteboardMutationDelta
  editorDelta: EditorStateMutationDelta
}) => {
  input.scene.update({
    document: {
      snapshot: input.engine.doc(),
      rev: input.engine.rev(),
      delta: input.documentDelta
    },
    editor: {
      snapshot: input.state.read(),
      delta: input.editorDelta
    }
  })
}

export const attachEditorSync = (input: {
  engine: Engine
  state: EditorStateRuntime
  scene: Pick<EditorSceneRuntime, 'update'>
  document: Pick<DocumentFrame, 'node' | 'edge'>
  cancelInput: () => void
}) => {
  let buffered: BufferedSceneCommit | null = null

  const bufferStateDelta = (
    commit: EditorStateCommit
  ) => {
    if (!buffered) {
      return false
    }

    buffered.editorDelta = mergeMutationDeltas(
      editorStateMutationSchema,
      buffered.editorDelta,
      commit.delta
    )
    return true
  }

  const unsubscribeEditorCommits = input.state.subscribe((commit) => {
    if (bufferStateDelta(commit)) {
      return
    }

    pushSceneUpdate({
      engine: input.engine,
      state: input.state,
      scene: input.scene,
      documentDelta: EMPTY_DOCUMENT_DELTA,
      editorDelta: commit.delta
    })
  })

  const unsubscribeEngineCommits = input.engine.commits.subscribe((commit) => {
    buffered = {
      document: {
        snapshot: commit.document,
        rev: commit.rev,
        delta: commit.delta
      },
      editorDelta: EMPTY_EDITOR_DELTA
    }

    if (commit.kind === 'replace' || isCheckpointProgram(commit.writes)) {
      input.cancelInput()
      resetEditorState(input.state)
    } else {
      reconcileEditorState({
        state: input.state,
        document: input.document
      })
    }

    const current = buffered
    buffered = null

    if (!current) {
      return
    }

    input.scene.update({
      document: current.document,
      editor: {
        snapshot: input.state.read(),
        delta: current.editorDelta
      }
    })
  })

  return () => {
    unsubscribeEngineCommits()
    unsubscribeEditorCommits()
  }
}
