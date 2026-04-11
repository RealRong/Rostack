import type { Engine } from '@whiteboard/engine'
import type { EditorRead } from '../../types/editor'
import type { PreviewRuntime } from '../preview/types'
import type { SessionRuntime } from '../session/types'
import {
  createDocumentCommands,
  createEdgeCommands,
  createGroupCommands,
  createNodeCommands
} from './commands'
import { createMindmapRuntime } from './mindmap'
import { createNodeMutations } from '../node/mutations'
import { createNodePatchWriter } from '../node/patch'
import { createNodeTextMutations } from '../node/text'
import type { DocumentRuntime } from './types'

export const createDocumentRuntime = ({
  engine,
  read,
  session,
  preview
}: {
  engine: Engine
  read: EditorRead
  session: Pick<SessionRuntime, 'edit' | 'selection'>
  preview: Pick<PreviewRuntime, 'node'>
}): DocumentRuntime => {
  const nodePatch = createNodePatchWriter(engine)
  const nodeMutations = createNodeMutations({
    engine,
    document: nodePatch
  })
  const nodeText = createNodeTextMutations({
    read,
    committedNode: engine.read.node.item,
    preview,
    session,
    deleteCascade: (ids) => engine.execute({
      type: 'node.deleteCascade',
      ids
    }),
    document: nodePatch,
    appearance: nodeMutations.appearance
  })
  const node = createNodeCommands({
    engine,
    patch: nodePatch,
    mutations: nodeMutations,
    text: {
      commit: nodeText.commit,
      setColor: nodeText.setColor,
      setSize: nodeText.setSize,
      setWeight: nodeText.setWeight,
      setItalic: nodeText.setItalic,
      setAlign: nodeText.setAlign
    }
  })

  const mindmap = createMindmapRuntime({
    execute: engine.execute,
    read,
    node: {
      update: nodePatch.update
    }
  })

  return {
    ...createDocumentCommands(engine),
    group: createGroupCommands(engine),
    edge: createEdgeCommands(engine),
    node,
    mindmap
  }
}
