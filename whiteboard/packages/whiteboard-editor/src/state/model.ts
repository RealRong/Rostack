import {
  defineMutationModel,
  record,
  singleton,
} from '@shared/mutation'
import type {
  SelectionTarget
} from '@whiteboard/core/selection'
import type {
  Viewport
} from '@whiteboard/core/types'
import type {
  HoverState,
  PreviewInput
} from '@whiteboard/editor-scene'
import type {
  DrawState
} from '@whiteboard/editor/schema/draw-state'
import type {
  EditSession
} from '@whiteboard/editor/schema/edit'
import type {
  Tool
} from '@whiteboard/editor/schema/tool'
import type {
  EditorStableInteractionState,
  EditorStateDocument
} from './document'

export const editorStateMutationModel = defineMutationModel<EditorStateDocument>()({
  state: singleton<EditorStateDocument, EditorStateDocument['state']>()({
    access: {
      read: (document) => document.state,
      write: (document, next) => ({
        ...document,
        state: next as EditorStateDocument['state'],
      }),
    },
    members: {
      tool: record<Tool>(),
      draw: record<DrawState>(),
      selection: record<SelectionTarget>(),
      edit: record<EditSession>(),
      interaction: record<EditorStableInteractionState>(),
      viewport: record<Viewport>(),
    },
    changes: ({ record }) => ({
      tool: [record('tool').deep()],
      draw: [record('draw').deep()],
      selection: [record('selection').deep()],
      edit: [record('edit').deep()],
      interaction: [record('interaction').deep()],
      viewport: [record('viewport').deep()],
    }),
  }),
  overlay: singleton<EditorStateDocument, EditorStateDocument['overlay']>()({
    access: {
      read: (document) => document.overlay,
      write: (document, next) => ({
        ...document,
        overlay: next as EditorStateDocument['overlay'],
      }),
    },
    members: {
      hover: record<HoverState>(),
      preview: record<PreviewInput>(),
    },
    changes: ({ record }) => ({
      hover: [record('hover').deep()],
      preview: [record('preview').deep()],
    }),
  }),
})
