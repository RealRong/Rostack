import {
  createEditor as createEditorBase
} from '@whiteboard/editor'
import type { NodeRegistry } from '#react/types/node'
import type { WhiteboardRuntime } from '#react/types/runtime'

export type CreateEditorInput = Omit<Parameters<typeof createEditorBase>[0], 'registry'> & {
  registry: NodeRegistry
}

export const createEditor = (
  input: CreateEditorInput
): WhiteboardRuntime => createEditorBase({
  ...input
}) as WhiteboardRuntime
