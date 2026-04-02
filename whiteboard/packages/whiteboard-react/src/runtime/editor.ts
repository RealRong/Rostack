import {
  createEditor as createEditorBase,
  type NodeRegistry as EditorNodeRegistry
} from '@whiteboard/editor'
import type { NodeRegistry } from '../types/node'
import type { WhiteboardRuntime } from '../types/runtime'

type CreateEditorInput = Omit<Parameters<typeof createEditorBase>[0], 'registry'> & {
  registry: NodeRegistry
}

export const createEditor = (
  input: CreateEditorInput
): WhiteboardRuntime => createEditorBase({
  ...input,
  registry: input.registry as unknown as EditorNodeRegistry
}) as WhiteboardRuntime
