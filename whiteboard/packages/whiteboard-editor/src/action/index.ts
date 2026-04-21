import { json } from '@shared/core'
import type { Engine } from '@whiteboard/engine'
import type { SelectionInput } from '@whiteboard/core/selection'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  EdgePatch,
  MindmapId,
  MindmapInsertInput,
  MindmapNodeId,
  MindmapTreePatch,
  NodeId,
  NodeStyle,
  Rect
} from '@whiteboard/core/types'
import type {
  AppActions,
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
import type { EditCapability, EditField } from '@whiteboard/editor/session/edit'
import type { EditorWrite } from '@whiteboard/editor/write'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { MindmapEnterPreview, MindmapPreviewState } from '@whiteboard/editor/session/preview/types'
import {
  createSelectionActions
} from '@whiteboard/editor/action/selection'
import {
  createClipboardActions
} from '@whiteboard/editor/action/clipboard'

const DEFAULT_MINDMAP_ENTER_DURATION_MS = 220

const stringifyToolPayload = (
  tool: Tool
) => {
  switch (tool.type) {
    case 'edge':
    case 'insert':
      return json.stableStringify(tool.template)
    case 'draw':
      return tool.mode
    default:
      return tool.type
  }
}

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
      return right.type === 'edge'
        && stringifyToolPayload(left) === stringifyToolPayload(right)
    case 'insert':
      return right.type === 'insert'
        && stringifyToolPayload(left) === stringifyToolPayload(right)
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
  layout: Pick<EditorLayout, 'draft'>
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

    session.mutate.edit.set({
      kind: 'node',
      nodeId,
      field,
      text,
      composing: false,
      caret: options?.caret ?? { kind: 'end' }
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
      text,
      composing: false,
      caret: options?.caret ?? { kind: 'end' }
    })
  }

  return {
    startNode,
    startEdgeLabel,
    input: session.mutate.edit.input,
    composing: session.mutate.edit.composing,
    caret: session.mutate.edit.caret,
    cancel: () => {
      const currentEdit = session.state.edit.get()
      if (!currentEdit) {
        return undefined
      }

      session.mutate.edit.clear()

      if (currentEdit.kind === 'edge-label') {
        const committedLabel = query.edge.committed.get(currentEdit.edgeId)?.edge.labels?.find(
          (label) => label.id === currentEdit.labelId
        )
        if (!committedLabel || committedLabel.text?.trim()) {
          return undefined
        }

        return write.edge.label.delete(currentEdit.edgeId, currentEdit.labelId)
      }

      return undefined
    },
    commit: () => {
      const currentEdit = session.state.edit.get()
      if (!currentEdit) {
        return undefined
      }

      if (currentEdit.kind === 'node') {
        const committed = query.node.committed.get(currentEdit.nodeId)
        if (!committed) {
          session.mutate.edit.clear()
          return undefined
        }

        const capability = resolveNodeCapability({
          registry,
          nodeType: committed.node.type,
          field: currentEdit.field
        })
        if (!capability) {
          session.mutate.edit.clear()
          return undefined
        }

        const draftLayout = layout.draft.node.get(currentEdit.nodeId)
        session.mutate.edit.clear()
        return write.node.text.commit({
          nodeId: currentEdit.nodeId,
          field: currentEdit.field,
          value: resolveNodeCommitValue({
            text: currentEdit.text,
            empty: capability.empty,
            defaultText: capability.defaultText
          }),
          size: draftLayout?.size,
          fontSize: draftLayout?.fontSize,
          wrapWidth: draftLayout?.wrapWidth
        })
      }

      session.mutate.edit.clear()

      if (!currentEdit.text.trim()) {
        return write.edge.label.delete(currentEdit.edgeId, currentEdit.labelId)
      }

      return write.edge.label.update(
        currentEdit.edgeId,
        currentEdit.labelId,
        {
          fields: {
            text: currentEdit.text
          }
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
  const structure = query.mindmap.structure.get(treeId)
  const layout = query.mindmap.layout.get(treeId)
  if (!structure || !layout) {
    return undefined
  }

  const parentId = structure.tree.nodes[nodeId]?.parentId
  const toRect = layout.computed.node[nodeId]
  const anchorRect = layout.computed.node[anchorId ?? parentId ?? '']
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

const toEdgeUpdateInput = (
  patch: EdgePatch
) => {
  const fields = {
    ...(patch.source ? { source: patch.source } : {}),
    ...(patch.target ? { target: patch.target } : {}),
    ...(patch.type ? { type: patch.type } : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, 'locked') ? { locked: patch.locked } : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, 'groupId') ? { groupId: patch.groupId } : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, 'textMode') ? { textMode: patch.textMode } : {})
  }
  const records = [
    ...(Object.prototype.hasOwnProperty.call(patch, 'data')
      ? [{
          scope: 'data' as const,
          op: 'set' as const,
          value: patch.data
        }]
      : []),
    ...(Object.prototype.hasOwnProperty.call(patch, 'style')
      ? [{
          scope: 'style' as const,
          op: 'set' as const,
          value: patch.style
        }]
      : [])
  ]

  return {
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
    ...(records.length > 0 ? { records } : {})
  }
}

const readMindmapIdForNodes = (
  query: Pick<EditorQuery, 'node'>,
  nodeIds: readonly NodeId[]
): MindmapId | undefined => {
  const ids = [...new Set(
    nodeIds.map((nodeId) => {
      const node = query.node.item.get(nodeId)?.node
      return node?.owner?.kind === 'mindmap'
        ? node.owner.id
        : undefined
    }).filter(Boolean)
  )]

  return ids.length === 1
    ? ids[0]
    : undefined
}

const readEdgeOrThrow = (
  query: Pick<EditorQuery, 'edge'>,
  edgeId: string
) => {
  const edge = query.edge.item.get(edgeId)?.edge
  if (!edge) {
    throw new Error(`Edge ${edgeId} not found.`)
  }

  return edge
}

export const createEditorActions = ({
  engine,
  session,
  query,
  layout,
  write,
  registry,
  defaults
}: {
  engine: Engine
  session: EditorSession
  query: EditorQuery
  layout: EditorLayout
  write: EditorWrite
  registry: NodeRegistry
  defaults: EditorDefaults['templates']
}): EditorActions => {
  const selectionSession = createSelectionSession(session)
  const selectionSessionDeps = {
    replaceSelection: selectionSession.replace,
    clearSelection: selectionSession.clear
  }
  const selectionActionsCore = createSelectionActions({
    read: query,
    canvas: write.canvas,
    group: write.group,
    node: write.node,
    session: selectionSessionDeps,
    defaults
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
    edge: (template) => {
      tool.set({ type: 'edge', template })
    },
    insert: (template) => {
      tool.set({ type: 'insert', template })
    },
    hand: () => {
      tool.set({ type: 'hand' })
    }
  }

  const mindmap: MindmapActions = {
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
    delete: write.mindmap.delete,
    patch: (id, input: MindmapTreePatch) => write.mindmap.layout.set(id, input.layout ?? {}),
    insert: (id, input, options) => {
      const result = write.mindmap.topic.insert(id, input)
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
    moveSubtree: (id, input) => write.mindmap.topic.move(id, input),
    removeSubtree: (id, input) => write.mindmap.topic.delete(id, input),
    cloneSubtree: (id, input) => write.mindmap.topic.clone(id, input),
    insertByPlacement: (input) => {
      const plan = mindmapApi.plan.insertTarget({
        tree: input.tree,
        targetNodeId: input.targetNodeId,
        placement: input.placement,
        layoutSide: input.layout.side
      })
      if (plan.mode === 'towardRoot') {
        return undefined
      }

      const result = write.mindmap.topic.insert(
        input.id,
        plan.mode === 'child'
          ? {
              kind: 'child',
              parentId: plan.parentId,
              payload: input.payload,
              options: {
                index: plan.index,
                side: plan.side
              }
            }
          : {
              kind: 'sibling',
              nodeId: plan.nodeId,
              position: plan.position,
              payload: input.payload
            }
      )
      if (!result.ok) {
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
    },
    moveByDrop: (input) => write.mindmap.topic.move(input.id, {
      nodeId: input.nodeId,
      parentId: input.drop.parentId,
      index: input.drop.index,
      side: input.drop.side
    }),
    moveRoot: (input) => {
      const directNode = query.node.item.get(input.nodeId)?.node
      const structure = query.mindmap.structure.get(input.nodeId)
      const node = directNode ?? (
        structure
          ? query.node.item.get(structure.rootId)?.node
          : undefined
      )
      const mindmapId = directNode?.owner?.kind === 'mindmap'
        ? directNode.owner.id
        : structure?.id
      if (!node || !mindmapId) {
        return undefined
      }

      const threshold = input.threshold ?? mindmapApi.plan.defaultRootMoveThreshold
      const delta = input.origin
        ? {
            x: input.position.x - input.origin.x,
            y: input.position.y - input.origin.y
          }
        : {
            x: input.position.x - node.position.x,
            y: input.position.y - node.position.y
          }
      if (Math.abs(delta.x) < threshold && Math.abs(delta.y) < threshold) {
        return undefined
      }

      return write.mindmap.move(mindmapId, input.position)
    },
    style: {
      branch: (input) => {
        const scopeIds = input.scope === 'subtree' && input.id
          ? query.mindmap.structure.get(input.id)?.nodeIds ?? input.nodeIds
          : input.nodeIds

        return write.mindmap.branch.update(
          input.id,
          [...scopeIds].map((topicId) => ({
            topicId,
            input: {
              fields: {
                ...input.patch
              }
            }
          }))
        )
      },
      topic: (input) => {
        const mindmapId = readMindmapIdForNodes(query, input.nodeIds)
        if (!mindmapId) {
          return undefined
        }

        const style = Object.fromEntries(
          Object.entries({
            frameKind: input.patch.frameKind,
            stroke: input.patch.stroke,
            strokeWidth: input.patch.strokeWidth,
            fill: input.patch.fill
          }).filter(([, value]) => value !== undefined)
        ) as NodeStyle

        return write.mindmap.topic.update(
          mindmapId,
          input.nodeIds.map((topicId) => ({
            topicId,
            input: {
              records: [{
                scope: 'style',
                op: 'set',
                value: style
              }]
            }
          }))
        )
      }
    }
  }

  return {
    app: {
      replace: write.document.replace
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
    node: {
      ...write.node,
      patch: (ids, update, options) => {
        if (nodeApi.update.isEmpty(update)) {
          return undefined
        }

        const updates = ids.flatMap((id) => query.node.committed.get(id)
          ? [{
              id,
              input: update
            }]
          : [])
        if (!updates.length) {
          return undefined
        }

        return write.node.updateMany(updates, {
          origin: options?.origin
        })
      }
    },
    edge: {
      ...write.edge,
      patch: (edgeIds: readonly string[], patch: EdgePatch) => {
        const input = toEdgeUpdateInput(patch)
        if (!input.fields && !input.records?.length) {
          return undefined
        }

        return write.edge.updateMany(
          edgeIds.flatMap((id) => query.edge.committed.get(id)
            ? [{
                id,
                input
              }]
            : [])
        )
      },
      route: {
        set: write.edge.route.set,
        insertPoint: (edgeId, index, point) => {
          const edge = readEdgeOrThrow(query, edgeId)
          const inserted = edgeApi.route.insert(edge, index, point)
          if (!inserted.ok) {
            throw new Error(inserted.error.message)
          }

          return write.edge.route.set(edgeId, inserted.data.patch.route ?? {
            kind: 'auto'
          })
        },
        movePoint: (edgeId, index, point) => {
          const patch = edgeApi.route.move(
            readEdgeOrThrow(query, edgeId),
            index,
            point
          )
          if (!patch) {
            throw new Error(`Edge route point ${edgeId}:${index} not found.`)
          }

          return write.edge.route.set(edgeId, patch.route ?? {
            kind: 'auto'
          })
        },
        removePoint: (edgeId, index) => {
          const patch = edgeApi.route.remove(
            readEdgeOrThrow(query, edgeId),
            index
          )
          if (!patch) {
            throw new Error(`Edge route point ${edgeId}:${index} not found.`)
          }

          return write.edge.route.set(edgeId, patch.route ?? {
            kind: 'auto'
          })
        },
        clear: write.edge.route.clear
      },
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

          const inserted = write.edge.label.insert(edgeId)
          if (!inserted.ok) {
            return undefined
          }
          const labelId = inserted.data.labelId

          selectionSession.replace({
            edgeIds: [edgeId]
          })
          edit.startEdgeLabel(edgeId, labelId)
          return labelId
        },
        patch: (edgeId, labelId, patch) => write.edge.label.update(
          edgeId,
          labelId,
          {
            fields: {
              ...(patch.text !== undefined ? { text: patch.text } : {}),
              ...(patch.t !== undefined ? { t: patch.t } : {}),
              ...(patch.offset !== undefined ? { offset: patch.offset } : {})
            },
            records: [
              ...(patch.style
                ? [{
                    scope: 'style' as const,
                    op: 'set' as const,
                    value: patch.style
                  }]
                : []),
              ...(patch.data
                ? [{
                    scope: 'data' as const,
                    op: 'set' as const,
                    value: patch.data
                  }]
                : [])
            ]
          }
        ),
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

          return write.edge.label.delete(edgeId, labelId)
        }
      }
    },
    mindmap,
    clipboard,
    history: write.history satisfies HistoryActions
  }
}
