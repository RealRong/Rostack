import { equal } from '@shared/core'
import {
  createMutationChange,
  type MutationWrite,
} from '@shared/mutation'
import {
  createWhiteboardChange,
  isCheckpointProgram,
  whiteboardMutationSchema
} from '@whiteboard/core/mutation'
import { createWhiteboardQuery } from '@whiteboard/core/query'
import type { WhiteboardChange } from '@whiteboard/engine/mutation'
import type { Engine } from '@whiteboard/engine'
import type { EditorSceneRuntime } from '@whiteboard/editor-scene'
import { editorStateMutationSchema } from '@whiteboard/editor/state/model'
import {
  EMPTY_HOVER_STATE,
  isEditorHoverStateEqual
} from '@whiteboard/editor/state/document'
import type {
  EditorStateCommit,
  EditorStateChange,
  EditorStateRuntime,
} from '@whiteboard/editor/state/runtime'
import type { DocumentFrame } from '@whiteboard/editor-scene'

const createEmptyDocumentChange = (
  document: ReturnType<Engine['doc']>
): WhiteboardChange => createWhiteboardChange(
  createWhiteboardQuery(() => document),
  createMutationChange(whiteboardMutationSchema)
)

const EMPTY_EDITOR_CHANGE = createMutationChange(editorStateMutationSchema)

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
    change: WhiteboardChange
  }
  editorWrites: MutationWrite[]
  editorReset: boolean
}

const pushSceneUpdate = (input: {
  engine: Engine
  state: EditorStateRuntime
  scene: Pick<EditorSceneRuntime, 'update'>
  documentChange: WhiteboardChange
  editorChange: EditorStateChange
}) => {
  input.scene.update({
    document: {
      snapshot: input.engine.doc(),
      rev: input.engine.rev(),
      change: input.documentChange
    },
    editor: {
      snapshot: input.state.read(),
      change: input.editorChange
    }
  })
}

const createBufferedEditorChange = (
  buffered: Pick<BufferedSceneCommit, 'editorWrites' | 'editorReset'>
): EditorStateChange => (
  buffered.editorWrites.length === 0 && !buffered.editorReset
    ? EMPTY_EDITOR_CHANGE
    : createMutationChange(
      editorStateMutationSchema,
      buffered.editorWrites,
      {
        reset: buffered.editorReset
      }
    )
)

export const attachEditorSync = (input: {
  engine: Engine
  state: EditorStateRuntime
  scene: Pick<EditorSceneRuntime, 'update'>
  document: Pick<DocumentFrame, 'node' | 'edge'>
  cancelInput: () => void
}) => {
  let buffered: BufferedSceneCommit | null = null

  const bufferStateChange = (
    commit: EditorStateCommit
  ) => {
    if (!buffered) {
      return false
    }

    buffered.editorWrites.push(...commit.change.writes())
    buffered.editorReset = buffered.editorReset || commit.change.reset()
    return true
  }

  const unsubscribeEditorCommits = input.state.subscribe((commit) => {
    if (bufferStateChange(commit)) {
      return
    }

    pushSceneUpdate({
      engine: input.engine,
      state: input.state,
      scene: input.scene,
      documentChange: createEmptyDocumentChange(input.engine.doc()),
      editorChange: commit.change
    })
  })

  const unsubscribeEngineCommits = input.engine.commits.subscribe((commit) => {
    buffered = {
      document: {
        snapshot: commit.document,
        rev: commit.rev,
        change: commit.change
      },
      editorWrites: [],
      editorReset: false
    }

    if (commit.change.reset() || isCheckpointProgram(commit.writes)) {
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
        change: createBufferedEditorChange(current)
      }
    })
  })

  return () => {
    unsubscribeEngineCommits()
    unsubscribeEditorCommits()
  }
}
