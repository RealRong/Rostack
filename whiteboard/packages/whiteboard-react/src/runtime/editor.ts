import {
  createEditor as createEditorBase
} from '@whiteboard/editor'
import type { NodeRegistry } from '../types/node'
import type { WhiteboardRuntime } from '../types/runtime'

export type CreateEditorInput = Omit<Parameters<typeof createEditorBase>[0], 'registry'> & {
  registry: NodeRegistry
}

export const createEditor = (
  input: CreateEditorInput
): WhiteboardRuntime => createEditorBase({
  ...input
}) as WhiteboardRuntime
