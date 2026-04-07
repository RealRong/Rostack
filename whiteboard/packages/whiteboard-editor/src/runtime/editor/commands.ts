import type { EngineInstance } from '@whiteboard/engine'
import type { Editor, EditorRead, EditorWriteApi } from '../../types/editor'
import type { EditorViewportRuntime } from './types'
import { createClipboard } from '../commands/clipboard'

export const createEditorCommands = ({
  engine,
  read,
  write,
  viewport
}: {
  engine: EngineInstance
  read: EditorRead
  write: EditorWriteApi
  viewport: EditorViewportRuntime['read']
}): Editor['commands'] => {
  const nodeTextCommands = {
    preview: ({
      nodeId,
      position,
      size,
      fontSize,
      mode,
      handle
    }) => {
      write.preview.node.text.set(nodeId, {
        position,
        size,
        fontSize,
        mode,
        handle
      })
    },
    clearPreview: (nodeId) => {
      write.preview.node.text.clearSize(nodeId)
    },
    cancel: ({ nodeId }) => {
      write.preview.node.text.clear(nodeId)
      write.session.edit.clear()
    },
    commit: write.document.node.text.commit,
    setColor: write.document.node.text.setColor,
    setSize: write.document.node.text.setSize,
    setWeight: write.document.node.text.setWeight,
    setItalic: write.document.node.text.setItalic,
    setAlign: write.document.node.text.setAlign
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
    mindmap: write.document.mindmap
  } satisfies Omit<Editor['commands'], 'clipboard'>

  return {
    ...baseCommands,
    clipboard: createClipboard({
      editor: {
        commands: baseCommands,
        read,
        state: {
          viewport
        }
      }
    })
  } satisfies Editor['commands']
}
