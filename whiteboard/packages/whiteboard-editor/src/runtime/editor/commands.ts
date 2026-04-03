import type { EngineInstance } from '@whiteboard/engine'
import type { Editor, EditorRead, EditorWriteApi } from '../../types/editor'
import type { RuntimeStateController } from '../state'
import { createClipboard } from '../clipboard'

export const createEditorCommands = ({
  engine,
  read,
  write,
  runtime
}: {
  engine: EngineInstance
  read: EditorRead
  write: EditorWriteApi
  runtime: Pick<RuntimeStateController, 'public'>
}): Editor['commands'] => {
  const nodeTextCommands = {
    preview: ({ nodeId, size }) => {
      write.preview.node.text.setSize(nodeId, size)
    },
    clearPreview: (nodeId) => {
      write.preview.node.text.clearSize(nodeId)
    },
    cancel: ({ nodeId }) => {
      write.preview.node.text.clearSize(nodeId)
      write.session.edit.clear()
    },
    commit: write.document.node.text.commit,
    setColor: write.document.node.text.setColor,
    setFontSize: write.document.node.text.setFontSize
  } satisfies Editor['commands']['node']['text']

  const baseCommands = {
    ...engine.commands,
    history: write.document.history,
    tool: write.session.tool,
    draw: write.view.draw,
    edit: write.session.edit,
    selection: write.session.selection,
    viewport: {
      set: write.view.viewport.set,
      panBy: write.view.viewport.panBy,
      zoomTo: write.view.viewport.zoomTo,
      fit: write.view.viewport.fit,
      reset: write.view.viewport.reset,
      setRect: write.view.viewport.setRect,
      setLimits: write.view.viewport.setLimits
    },
    edge: write.document.edge,
    node: {
      ...write.document.node,
      text: nodeTextCommands
    },
    mindmap: write.document.mindmap,
    insert: write.document.insert
  } satisfies Omit<Editor['commands'], 'clipboard'>

  return {
    ...baseCommands,
    clipboard: createClipboard({
      editor: {
        commands: baseCommands,
        read,
        state: runtime.public.state
      }
    })
  } satisfies Editor['commands']
}
