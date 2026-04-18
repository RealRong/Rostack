import type { Engine } from '@whiteboard/engine'
import type { CommandResult } from '@whiteboard/engine/types/result'
import type { SelectionInput } from '@whiteboard/core/selection'
import type { NodeId } from '@whiteboard/core/types'
import type {
  AppActions,
  AppConfig,
  ClipboardCommands,
  HistoryCommands,
  MindmapCommands,
  ToolActions
} from '@whiteboard/editor/types/commands'
import type {
  EditorActions,
  EditorEditActions,
  EditorSelectionActions
} from '@whiteboard/editor/types/editor'
import type { EditorLocal } from '@whiteboard/editor/local/runtime'
import type { EditorQuery } from '@whiteboard/editor/query'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
import type { EditCapability, EditField } from '@whiteboard/editor/local/session/edit'
import type { EditorCommands } from '@whiteboard/editor/command'
import type { Tool } from '@whiteboard/editor/types/tool'
import {
  createSelectionCommands
} from '@whiteboard/editor/command/selection'
import {
  createClipboardCommands
} from '@whiteboard/editor/command/clipboard'

const resolveNodeCommitValue = (input: {
  text: string
  empty: 'default' | 'keep' | 'remove'
  defaultText?: string
}) => (
  input.empty === 'default' && !input.text.trim()
    ? (input.defaultText ?? '')
    : input.text
)

const isSameTool = (
  left: Tool,
  right: Tool
) => {
  if (left.type !== right.type) {
    return false
  }

  switch (left.type) {
    case 'edge':
      return right.type === 'edge' && left.preset === right.preset
    case 'insert':
      return right.type === 'insert' && left.preset === right.preset
    case 'draw':
      return right.type === 'draw' && left.mode === right.mode
    default:
      return true
  }
}

const applySelectionMutation = (
  local: Pick<EditorLocal, 'mutate'>,
  apply: () => boolean
) => {
  if (!apply()) {
    return
  }

  local.mutate.edit.clear()
}

const createSelectionSession = (
  local: Pick<EditorLocal, 'mutate'>
) => ({
  replace: (input: SelectionInput) => {
    applySelectionMutation(local, () => local.mutate.selection.replace(input))
  },
  add: (input: SelectionInput) => {
    applySelectionMutation(local, () => local.mutate.selection.add(input))
  },
  remove: (input: SelectionInput) => {
    applySelectionMutation(local, () => local.mutate.selection.remove(input))
  },
  toggle: (input: SelectionInput) => {
    applySelectionMutation(local, () => local.mutate.selection.toggle(input))
  },
  selectAll: () => {
    return
  },
  clear: () => {
    applySelectionMutation(local, () => local.mutate.selection.clear())
  }
})

const DEFAULT_EDGE_LABEL_CAPABILITY: EditCapability = {
  placeholder: 'Label',
  multiline: true,
  empty: 'remove'
}

const resolveNodeCapability = ({
  registry,
  nodeType,
  field
}: {
  registry: Pick<NodeRegistry, 'get'>
  nodeType: Parameters<Pick<NodeRegistry, 'get'>['get']>[0]
  field: EditField
}) => registry.get(nodeType)?.edit?.fields?.[field]

const createEditActions = ({
  local,
  query,
  commands,
  registry,
  layout
}: {
  local: Pick<EditorLocal, 'source' | 'mutate'>
  query: Pick<EditorQuery, 'node' | 'edge'>
  commands: Pick<EditorCommands, 'node' | 'edge'>
  registry: Pick<NodeRegistry, 'get'>
  layout: Pick<EditorLayout, 'editNode'>
}): EditorEditActions => {
  const startNode: EditorEditActions['startNode'] = (
    nodeId,
    field,
    options
  ) => {
    const item = query.node.item.get(nodeId)
    if (!item) {
      return
    }

    const capabilities = resolveNodeCapability({
      registry,
      nodeType: item.node.type,
      field
    })
    if (!capabilities) {
      return
    }

    const text = typeof item.node.data?.[field] === 'string'
      ? item.node.data[field] as string
      : ''
    const nextLayout = layout.editNode({
      nodeId,
      field,
      text
    })

    local.mutate.edit.set({
      kind: 'node',
      nodeId,
      field,
      initial: {
        text
      },
      draft: {
        text
      },
      layout: {
        size: nextLayout?.size ?? {
          width: item.rect.width,
          height: item.rect.height
        },
        fontSize: nextLayout?.fontSize ?? (
          typeof item.node.style?.fontSize === 'number'
            ? item.node.style.fontSize
            : undefined
        ),
        wrapWidth: nextLayout?.wrapWidth,
        composing: false
      },
      caret: options?.caret ?? { kind: 'end' },
      status: 'active',
      capabilities
    })
  }

  const startEdgeLabel: EditorEditActions['startEdgeLabel'] = (
    edgeId,
    labelId,
    options
  ) => {
    const edge = query.edge.item.get(edgeId)?.edge
    const label = edge?.labels?.find((entry) => entry.id === labelId)
    if (!edge || !label) {
      return
    }

    const text = typeof label.text === 'string' ? label.text : ''

    local.mutate.edit.set({
      kind: 'edge-label',
      edgeId,
      labelId,
      initial: {
        text
      },
      draft: {
        text
      },
      layout: {
        composing: false
      },
      caret: options?.caret ?? { kind: 'end' },
      status: 'active',
      capabilities: DEFAULT_EDGE_LABEL_CAPABILITY
    })
  }

  return {
    startNode,
    startEdgeLabel,
    input: (text) => {
      local.mutate.edit.input(text)

      const current = local.source.edit.get()
      if (!current || current.kind !== 'node') {
        return
      }

      const nextLayout = layout.editNode({
        nodeId: current.nodeId,
        field: current.field,
        text
      })
      local.mutate.edit.layout(nextLayout ?? {})
    },
    layout: local.mutate.edit.layout,
    caret: local.mutate.edit.caret,
    cancel: () => {
      const currentEdit = local.source.edit.get()
      if (!currentEdit) {
        return undefined
      }

      local.mutate.edit.clear()

      if (
        currentEdit.kind === 'edge-label'
        && currentEdit.capabilities.empty === 'remove'
        && !currentEdit.initial.text.trim()
      ) {
        const committedEdge = query.edge.committed.get(currentEdit.edgeId)?.edge
        if (!committedEdge?.labels?.some((label) => label.id === currentEdit.labelId)) {
          return undefined
        }

        return commands.edge.label.remove(currentEdit.edgeId, currentEdit.labelId)
      }

      return undefined
    },
    commit: () => {
      const currentEdit = local.source.edit.get()
      if (!currentEdit) {
        return undefined
      }

      local.mutate.edit.status('committing')

      if (currentEdit.kind === 'node') {
        const committed = query.node.committed.get(currentEdit.nodeId)
        if (!committed) {
          local.mutate.edit.clear()
          return undefined
        }

        local.mutate.edit.clear()
        return commands.node.text.commit({
          nodeId: currentEdit.nodeId,
          field: currentEdit.field,
          value: resolveNodeCommitValue({
            text: currentEdit.draft.text,
            empty: currentEdit.capabilities.empty,
            defaultText: currentEdit.capabilities.defaultText
          }),
          size: currentEdit.layout.size,
          fontSize: currentEdit.layout.fontSize,
          wrapWidth: currentEdit.layout.wrapWidth
        })
      }

      local.mutate.edit.clear()

      if (
        currentEdit.capabilities.empty === 'remove'
        && !currentEdit.draft.text.trim()
      ) {
        return commands.edge.label.remove(currentEdit.edgeId, currentEdit.labelId)
      }

      return commands.edge.label.patch(
        currentEdit.edgeId,
        currentEdit.labelId,
        {
          text: currentEdit.draft.text
        }
      )
    }
  }
}

export const createEditorActions = ({
  engine,
  local,
  query,
  layout,
  commands,
  registry,
  dispose
}: {
  engine: Engine
  local: EditorLocal
  query: EditorQuery
  layout: EditorLayout
  commands: EditorCommands
  registry: NodeRegistry
  dispose: () => void
}): EditorActions => {
  const selectionSession = createSelectionSession(local)
  const selectionActionsCore = createSelectionCommands({
    read: query,
    document: commands.document,
    node: commands.node,
    session: {
      selection: selectionSession
    }
  })
  const clipboard: ClipboardCommands = createClipboardCommands({
    editor: {
      read: query,
      document: commands.document,
      session: {
        selection: selectionSession
      },
      selection: {
        delete: selectionActionsCore.delete
      },
      state: {
        viewport: local.viewport.read,
        selection: local.source.selection
      }
    }
  })
  const edit = createEditActions({
    local,
    query,
    commands,
    registry,
    layout
  })

  const selection: EditorSelectionActions = {
    replace: selectionSession.replace,
    add: selectionSession.add,
    remove: selectionSession.remove,
    toggle: selectionSession.toggle,
    selectAll: () => {
      applySelectionMutation(local, () => local.mutate.selection.replace({
        nodeIds: query.node.list.get(),
        edgeIds: query.edge.list.get()
      }))
    },
    clear: selectionSession.clear,
    frame: selectionActionsCore.frame,
    order: selectionActionsCore.order,
    group: selectionActionsCore.group,
    ungroup: selectionActionsCore.ungroup,
    delete: selectionActionsCore.delete,
    duplicate: selectionActionsCore.duplicate
  }

  const tool: ToolActions = {
    set: (nextTool) => {
      const currentTool = local.source.tool.get()
      const toolChanged = !isSameTool(currentTool, nextTool)

      if (toolChanged || nextTool.type === 'draw') {
        local.mutate.edit.clear()
        local.mutate.selection.clear()
      }

      if (!toolChanged) {
        return
      }

      local.mutate.tool.set(nextTool)
    },
    select: () => {
      tool.set({ type: 'select' })
    },
    draw: (mode) => {
      tool.set({ type: 'draw', mode })
    },
    edge: (preset) => {
      tool.set({ type: 'edge', preset })
    },
    insert: (preset) => {
      tool.set({ type: 'insert', preset })
    },
    hand: () => {
      tool.set({ type: 'hand' })
    }
  }

  return {
    app: {
      reset: () => {
        local.reset()
      },
      replace: commands.document.replace,
      export: () => engine.document.get(),
      configure: (config: AppConfig) => {
        engine.configure({
          history: config.history
        })
      },
      dispose
    } satisfies AppActions,
    tool,
    viewport: {
      set: local.viewport.commands.set,
      panBy: local.viewport.commands.panBy,
      zoomTo: local.viewport.commands.zoomTo,
      fit: local.viewport.commands.fit,
      reset: local.viewport.commands.reset,
      setRect: local.viewport.setRect,
      setLimits: local.viewport.setLimits
    },
    draw: {
      set: local.mutate.draw.set,
      slot: local.mutate.draw.slot,
      patch: local.mutate.draw.patch
    },
    selection,
    edit,
    node: commands.node,
    edge: {
      ...commands.edge,
      label: {
        ...commands.edge.label,
        add: (edgeId) => {
          const currentEdit = local.source.edit.get()
          if (
            currentEdit
            && currentEdit.kind === 'edge-label'
            && currentEdit.edgeId === edgeId
          ) {
            return undefined
          }

          const labelId = commands.edge.label.add(edgeId)
          if (!labelId) {
            return undefined
          }

          selectionSession.replace({
            edgeIds: [edgeId]
          })
          edit.startEdgeLabel(edgeId, labelId)
          return labelId
        },
        remove: (edgeId, labelId) => {
          const currentEdit = local.source.edit.get()
          if (
            currentEdit
            && currentEdit.kind === 'edge-label'
            && currentEdit.edgeId === edgeId
            && currentEdit.labelId === labelId
          ) {
            local.mutate.edit.clear()
          }

          return commands.edge.label.remove(edgeId, labelId)
        }
      }
    },
    mindmap: commands.mindmap as MindmapCommands,
    clipboard,
    history: commands.history as HistoryCommands
  }
}
