import type { Engine } from '@whiteboard/engine'
import type { SelectionInput } from '@whiteboard/core/selection'
import type {
  MindmapId,
  MindmapInsertInput,
  MindmapNodeId,
  Rect
} from '@whiteboard/core/types'
import type {
  AppActions,
  AppConfig,
  ClipboardActions,
  EditorActions,
  EditorEditActions,
  EditorSelectionActions,
  HistoryActions,
  MindmapActions,
  MindmapInsertBehavior,
  ToolActions
} from '@whiteboard/editor/action/types'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { EditorQuery } from '@whiteboard/editor/query'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
import type { EditCapability, EditField } from '@whiteboard/editor/local/session/edit'
import type { EditorWrite } from '@whiteboard/editor/write'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { MindmapEnterPreview, MindmapPreviewState } from '@whiteboard/editor/session/preview/types'
import {
  createSelectionActions
} from '@whiteboard/editor/action/selection'
import {
  createClipboardActions
} from '@whiteboard/editor/action/clipboard'

const DEFAULT_MINDMAP_ENTER_DURATION_MS = 220

const readNow = () => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
)

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
  session: Pick<EditorSession, 'mutate'>,
  apply: () => boolean
) => {
  if (!apply()) {
    return
  }

  session.mutate.edit.clear()
}

const createSelectionSession = (
  session: Pick<EditorSession, 'mutate'>
) => ({
  replace: (input: SelectionInput) => {
    applySelectionMutation(session, () => session.mutate.selection.replace(input))
  },
  add: (input: SelectionInput) => {
    applySelectionMutation(session, () => session.mutate.selection.add(input))
  },
  remove: (input: SelectionInput) => {
    applySelectionMutation(session, () => session.mutate.selection.remove(input))
  },
  toggle: (input: SelectionInput) => {
    applySelectionMutation(session, () => session.mutate.selection.toggle(input))
  },
  selectAll: () => {
    return
  },
  clear: () => {
    applySelectionMutation(session, () => session.mutate.selection.clear())
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
  session,
  query,
  write,
  registry,
  layout
}: {
  session: Pick<EditorSession, 'state' | 'mutate'>
  query: Pick<EditorQuery, 'node' | 'edge'>
  write: Pick<EditorWrite, 'node' | 'edge'>
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

    session.mutate.edit.set({
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

    session.mutate.edit.set({
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
      session.mutate.edit.input(text)

      const current = session.state.edit.get()
      if (!current || current.kind !== 'node') {
        return
      }

      const nextLayout = layout.editNode({
        nodeId: current.nodeId,
        field: current.field,
        text
      })
      session.mutate.edit.layout(nextLayout ?? {})
    },
    layout: session.mutate.edit.layout,
    caret: session.mutate.edit.caret,
    cancel: () => {
      const currentEdit = session.state.edit.get()
      if (!currentEdit) {
        return undefined
      }

      session.mutate.edit.clear()

      if (
        currentEdit.kind === 'edge-label'
        && currentEdit.capabilities.empty === 'remove'
        && !currentEdit.initial.text.trim()
      ) {
        const committedEdge = query.edge.committed.get(currentEdit.edgeId)?.edge
        if (!committedEdge?.labels?.some((label) => label.id === currentEdit.labelId)) {
          return undefined
        }

        return write.edge.label.remove(currentEdit.edgeId, currentEdit.labelId)
      }

      return undefined
    },
    commit: () => {
      const currentEdit = session.state.edit.get()
      if (!currentEdit) {
        return undefined
      }

      session.mutate.edit.status('committing')

      if (currentEdit.kind === 'node') {
        const committed = query.node.committed.get(currentEdit.nodeId)
        if (!committed) {
          session.mutate.edit.clear()
          return undefined
        }

        session.mutate.edit.clear()
        return write.node.text.commit({
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

      session.mutate.edit.clear()

      if (
        currentEdit.capabilities.empty === 'remove'
        && !currentEdit.draft.text.trim()
      ) {
        return write.edge.label.remove(currentEdit.edgeId, currentEdit.labelId)
      }

      return write.edge.label.patch(
        currentEdit.edgeId,
        currentEdit.labelId,
        {
          text: currentEdit.draft.text
        }
      )
    }
  }
}

const withMindmapPreview = (
  session: Pick<EditorSession, 'preview'>,
  project: (current: MindmapPreviewState | undefined) => MindmapPreviewState | undefined
) => {
  session.preview.write.set((current) => {
    const nextPreview = project(current.mindmap.preview)
    if (nextPreview === current.mindmap.preview) {
      return current
    }

    if (!nextPreview) {
      return current.mindmap.preview === undefined
        ? current
        : {
            ...current,
            mindmap: {}
          }
    }

    return {
      ...current,
      mindmap: {
        ...current.mindmap,
        preview: nextPreview
      }
    }
  })
}

const appendMindmapEnterPreview = (
  session: Pick<EditorSession, 'preview'>,
  entry: MindmapEnterPreview
) => {
  withMindmapPreview(session, (current) => ({
    ...current,
    enter: [
      ...(current?.enter ?? []).filter((preview) => (
        preview.treeId !== entry.treeId || preview.nodeId !== entry.nodeId
      )),
      entry
    ]
  }))

  setTimeout(() => {
    withMindmapPreview(session, (current) => {
      const nextEnter = current?.enter?.filter((preview) => (
        preview.treeId !== entry.treeId || preview.nodeId !== entry.nodeId
      ))
      if (!current) {
        return undefined
      }

      return {
        ...current,
        enter: nextEnter?.length ? nextEnter : undefined
      }
    })
  }, entry.durationMs + 34)
}

const toRectCenter = (
  rect: Rect
) => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2
})

const readInsertAnchorId = (
  input: MindmapInsertInput
) => {
  const anchorId = input.options?.layout?.anchorId
  if (anchorId) {
    return anchorId
  }

  switch (input.kind) {
    case 'child':
      return input.parentId
    case 'sibling':
    case 'parent':
      return input.nodeId
  }
}

const buildMindmapEnterPreview = ({
  query,
  treeId,
  nodeId,
  anchorId
}: {
  query: Pick<EditorQuery, 'mindmap'>
  treeId: MindmapId
  nodeId: MindmapNodeId
  anchorId?: MindmapNodeId
}): MindmapEnterPreview | undefined => {
  const item = query.mindmap.item.get(treeId)
  if (!item) {
    return undefined
  }

  const parentId = item.tree.nodes[nodeId]?.parentId
  const toRect = item.computed.node[nodeId]
  const anchorRect = item.computed.node[anchorId ?? parentId ?? '']
  if (!toRect || !parentId || !anchorRect) {
    return undefined
  }

  const anchorCenter = toRectCenter(anchorRect)
  const targetCenter = toRectCenter(toRect)

  return {
    treeId,
    nodeId,
    parentId,
    route: [anchorCenter, targetCenter],
    fromRect: {
      x: anchorCenter.x - toRect.width / 2,
      y: anchorCenter.y - toRect.height / 2,
      width: toRect.width,
      height: toRect.height
    },
    toRect: {
      ...toRect
    },
    startedAt: readNow(),
    durationMs: DEFAULT_MINDMAP_ENTER_DURATION_MS
  }
}

const focusMindmapNode = ({
  nodeId,
  behavior,
  selection,
  edit,
  delayMs = 0
}: {
  nodeId: MindmapNodeId
  behavior: MindmapInsertBehavior | undefined
  selection: Pick<EditorSelectionActions, 'replace'>
  edit: Pick<EditorEditActions, 'startNode'>
  delayMs?: number
}) => {
  const focus = behavior?.focus ?? 'select-new'
  if (focus === 'keep-current') {
    return
  }

  const apply = () => {
    selection.replace({
      nodeIds: [nodeId]
    })
    if (focus === 'edit-new') {
      edit.startNode(nodeId, 'text')
    }
  }

  if (delayMs > 0) {
    setTimeout(apply, delayMs)
    return
  }

  apply()
}

const focusMindmapRoot = ({
  nodeId,
  focus,
  selection,
  edit
}: {
  nodeId: MindmapNodeId
  focus: 'edit-root' | 'select-root' | 'none' | undefined
  selection: Pick<EditorSelectionActions, 'replace'>
  edit: Pick<EditorEditActions, 'startNode'>
}) => {
  if (!focus || focus === 'none') {
    return
  }

  selection.replace({
    nodeIds: [nodeId]
  })
  if (focus === 'edit-root') {
    edit.startNode(nodeId, 'text')
  }
}

export const createEditorActions = ({
  engine,
  session,
  query,
  layout,
  write,
  registry
}: {
  engine: Engine
  session: EditorSession
  query: EditorQuery
  layout: EditorLayout
  write: EditorWrite
  registry: NodeRegistry
}): EditorActions => {
  const selectionSession = createSelectionSession(session)
  const selectionSessionDeps = {
    replaceSelection: selectionSession.replace,
    clearSelection: selectionSession.clear
  }
  const selectionActionsCore = createSelectionActions({
    read: query,
    document: write.document,
    node: write.node,
    session: selectionSessionDeps
  })
  const clipboard: ClipboardActions = createClipboardActions({
    editor: {
      read: query,
      document: write.document,
      session: selectionSessionDeps,
      selection: {
        delete: selectionActionsCore.delete
      },
      state: {
        viewport: session.viewport.read,
        selection: session.state.selection
      }
    }
  })
  const edit = createEditActions({
    session,
    query,
    write,
    registry,
    layout
  })

  const selection: EditorSelectionActions = {
    replace: selectionSession.replace,
    add: selectionSession.add,
    remove: selectionSession.remove,
    toggle: selectionSession.toggle,
    selectAll: () => {
      applySelectionMutation(session, () => session.mutate.selection.replace({
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
      const currentTool = session.state.tool.get()
      const toolChanged = !isSameTool(currentTool, nextTool)

      if (toolChanged || nextTool.type === 'draw') {
        session.mutate.edit.clear()
        session.mutate.selection.clear()
      }

      if (!toolChanged) {
        return
      }

      session.mutate.tool.set(nextTool)
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

  const mindmap: MindmapActions = {
    ...write.mindmap,
    create: (payload, options) => {
      const result = write.mindmap.create(payload)
      if (result.ok) {
        focusMindmapRoot({
          nodeId: result.data.rootId,
          focus: options?.focus,
          selection,
          edit
        })
      }
      return result
    },
    insert: (id, input, options) => {
      const result = write.mindmap.insert(id, input)
      if (!result.ok) {
        return result
      }

      let focusDelayMs = 0
      if (options?.behavior?.enter === 'from-anchor') {
        const preview = buildMindmapEnterPreview({
          query,
          treeId: id,
          nodeId: result.data.nodeId,
          anchorId: readInsertAnchorId(input)
        })
        if (preview) {
          focusDelayMs = preview.durationMs
          appendMindmapEnterPreview(session, preview)
        }
      }

      focusMindmapNode({
        nodeId: result.data.nodeId,
        behavior: options?.behavior,
        selection,
        edit,
        delayMs: focusDelayMs
      })
      return result
    },
    insertByPlacement: (input) => {
      const result = write.mindmap.insertByPlacement(input)
      if (!result?.ok) {
        return result
      }

      let focusDelayMs = 0
      if (input.behavior?.enter === 'from-anchor') {
        const preview = buildMindmapEnterPreview({
          query,
          treeId: input.id,
          nodeId: result.data.nodeId,
          anchorId: input.targetNodeId
        })
        if (preview) {
          focusDelayMs = preview.durationMs
          appendMindmapEnterPreview(session, preview)
        }
      }

      focusMindmapNode({
        nodeId: result.data.nodeId,
        behavior: input.behavior,
        selection,
        edit,
        delayMs: focusDelayMs
      })
      return result
    }
  }

  return {
    app: {
      replace: write.document.replace,
      configure: (config: AppConfig) => {
        engine.configure({
          history: config.history
        })
      }
    } satisfies AppActions,
    tool,
    viewport: {
      set: session.viewport.commands.set,
      panBy: session.viewport.commands.panBy,
      zoomTo: session.viewport.commands.zoomTo,
      fit: session.viewport.commands.fit,
      reset: session.viewport.commands.reset,
      setRect: session.viewport.setRect,
      setLimits: session.viewport.setLimits
    },
    draw: {
      set: session.mutate.draw.set,
      slot: session.mutate.draw.slot,
      patch: session.mutate.draw.patch
    },
    selection,
    edit,
    node: write.node,
    edge: {
      ...write.edge,
      label: {
        ...write.edge.label,
        add: (edgeId) => {
          const currentEdit = session.state.edit.get()
          if (
            currentEdit
            && currentEdit.kind === 'edge-label'
            && currentEdit.edgeId === edgeId
          ) {
            return undefined
          }

          const labelId = write.edge.label.add(edgeId)
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
          const currentEdit = session.state.edit.get()
          if (
            currentEdit
            && currentEdit.kind === 'edge-label'
            && currentEdit.edgeId === edgeId
            && currentEdit.labelId === labelId
          ) {
            session.mutate.edit.clear()
          }

          return write.edge.label.remove(edgeId, labelId)
        }
      }
    },
    mindmap,
    clipboard,
    history: write.history satisfies HistoryActions
  }
}
