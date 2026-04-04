import type { EngineInstance } from '@whiteboard/engine'
import type {
  EditorDocumentWrite,
  EditorPreviewWrite,
  EditorRead,
  EditorSessionWrite
} from '../../types/editor'
import { createMindmapWrite } from '../commands/mindmap'
import { createNodeAppearanceCommands } from '../commands/node/appearance'
import { createNodeDocumentCommands } from '../commands/node/document'
import { createNodeLockCommands } from '../commands/node/lock'
import { createNodeTextCommands } from '../commands/node/text'

export const createDocumentWrite = ({
  engine,
  read,
  session,
  preview
}: {
  engine: EngineInstance
  read: EditorRead
  session: Pick<EditorSessionWrite, 'edit' | 'selection'>
  preview: Pick<EditorPreviewWrite, 'node'>
}): EditorDocumentWrite => {
  const nodeDocument = createNodeDocumentCommands(engine)
  const nodeAppearance = createNodeAppearanceCommands({
    engine,
    document: nodeDocument
  })
  const nodeLock = createNodeLockCommands({
    engine,
    document: nodeDocument
  })
  const nodeText = createNodeTextCommands({
    read,
    committedNode: engine.read.node.item,
    preview,
    session,
    deleteCascade: engine.commands.node.deleteCascade,
    document: nodeDocument,
    appearance: nodeAppearance
  })

  const node = {
    create: engine.commands.node.create,
    move: engine.commands.node.move,
    align: engine.commands.node.align,
    distribute: engine.commands.node.distribute,
    delete: engine.commands.node.delete,
    deleteCascade: engine.commands.node.deleteCascade,
    duplicate: engine.commands.node.duplicate,
    group: engine.commands.node.group,
    order: engine.commands.node.order,
    document: nodeDocument,
    lock: nodeLock,
    appearance: nodeAppearance,
    text: {
      commit: nodeText.commit,
      setColor: nodeText.setColor,
      setFontSize: nodeText.setFontSize
    }
  } satisfies EditorDocumentWrite['node']

  const mindmap = createMindmapWrite({
    engine,
    writerHost: {
      read,
      document: {
        mindmap: engine.commands.mindmap,
        node: {
          document: nodeDocument
        }
      }
    }
  })

  return {
    doc: engine.commands.document,
    history: engine.commands.history,
    edge: engine.commands.edge,
    node,
    mindmap
  }
}
