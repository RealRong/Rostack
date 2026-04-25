import type { SelectionInput } from '@whiteboard/core/selection'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  EdgePatch,
  MindmapId,
  MindmapNodeId,
  NodeId,
  NodeStyle,
} from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type {
  AppActions,
  ClipboardActions,
  EditorActions,
  EditorEditActions,
  EditorSelectionActions,
  HistoryActions,
  MindmapInsertBehavior,
  ToolActions
} from '@whiteboard/editor/action/types'
import {
  createClipboardActions
} from '@whiteboard/editor/action/clipboard'
import {
  createSelectionActions
} from '@whiteboard/editor/action/selection'
import type {
  EditorBoundaryRuntime
} from '@whiteboard/editor/boundary/runtime'
import type { EditorDocumentRuntimeSource } from '@whiteboard/editor/document/source'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import {
  createMindmapActionProcedures
} from '@whiteboard/editor/procedures/mindmap'
import type { EditorSceneRuntime } from '@whiteboard/editor/scene/source'
import type { EditField } from '@whiteboard/editor/session/edit'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { ToolService } from '@whiteboard/editor/services/tool'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
import type { EditorWrite } from '@whiteboard/editor/write'

const resolveNodeCommitValue = (input: {
  text: string
  empty: 'default' | 'keep' | 'remove'
  defaultText?: string
}) => (
  input.empty === 'default' && !input.text.trim()
    ? (input.defaultText ?? '')
    : input.text
)

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

const startNodeEdit = ({
  session,
  document,
  registry,
  nodeId,
  field,
  caret
}: {
  session: Pick<EditorSession, 'mutate'>
  document: Pick<EditorDocumentRuntimeSource, 'node'>
  registry: Pick<NodeRegistry, 'get'>
  nodeId: NodeId
  field: EditField
  caret?: EditorEditActions['startNode'] extends (
    nodeId: NodeId,
    field: EditField,
    options?: infer TOptions
  ) => void
    ? TOptions extends { caret?: infer TCaret }
      ? TCaret
      : never
    : never
}) => {
  const committed = document.node.committed.get(nodeId)
  if (!committed) {
    return
  }

  const capabilities = resolveNodeCapability({
    registry,
    nodeType: committed.node.type,
    field
  })
  if (!capabilities) {
    return
  }

  const text = typeof committed.node.data?.[field] === 'string'
    ? committed.node.data[field] as string
    : ''

  session.mutate.edit.set({
    kind: 'node',
    nodeId,
    field,
    text,
    composing: false,
    caret: caret ?? { kind: 'end' }
  })
}

const startEdgeLabelEdit = ({
  session,
  document,
  edgeId,
  labelId,
  caret
}: {
  session: Pick<EditorSession, 'mutate'>
  document: Pick<EditorDocumentRuntimeSource, 'edge'>
  edgeId: string
  labelId: string
  caret?: EditorEditActions['startEdgeLabel'] extends (
    edgeId: string,
    labelId: string,
    options?: infer TOptions
  ) => void
    ? TOptions extends { caret?: infer TCaret }
      ? TCaret
      : never
    : never
}) => {
  const edge = document.edge.item.get(edgeId)?.edge
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
    caret: caret ?? { kind: 'end' }
  })
}

const applyMindmapFocus = ({
  session,
  document,
  registry,
  nodeId,
  behavior
}: {
  session: Pick<EditorSession, 'mutate'>
  document: Pick<EditorDocumentRuntimeSource, 'node'>
  registry: Pick<NodeRegistry, 'get'>
  nodeId: MindmapNodeId
  behavior: MindmapInsertBehavior | undefined
}) => {
  const focus = behavior?.focus ?? 'select-new'
  if (focus === 'keep-current') {
    return
  }

  applySelectionMutation(session, () => session.mutate.selection.replace({
    nodeIds: [nodeId]
  }))
  if (focus === 'edit-new') {
    startNodeEdit({
      session,
      document,
      registry,
      nodeId,
      field: 'text'
    })
  }
}

const applyMindmapRootFocus = ({
  session,
  document,
  registry,
  nodeId,
  focus
}: {
  session: Pick<EditorSession, 'mutate'>
  document: Pick<EditorDocumentRuntimeSource, 'node'>
  registry: Pick<NodeRegistry, 'get'>
  nodeId: MindmapNodeId
  focus: 'edit-root' | 'select-root' | 'none' | undefined
}) => {
  if (!focus || focus === 'none') {
    return
  }

  applySelectionMutation(session, () => session.mutate.selection.replace({
    nodeIds: [nodeId]
  }))
  if (focus === 'edit-root') {
    startNodeEdit({
      session,
      document,
      registry,
      nodeId,
      field: 'text'
    })
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
  input: {
    document: Pick<EditorDocumentRuntimeSource, 'node'>
    graph: Pick<EditorSceneRuntime, 'node'>
      & Pick<EditorSceneRuntime, 'mindmap'>
    nodeIds: readonly NodeId[]
  }
): MindmapId | undefined => {
  const resolved = input.nodeIds.map((nodeId) => {
    const projectedNode = input.graph.node.graph.get(nodeId)?.base.node
    const committedNode = input.document.node.committed.get(nodeId)?.node
    const projectedOwner = projectedNode?.owner
    const committedOwner = committedNode?.owner
    const legacyMindmapId = (() => {
      const projectedId = (projectedNode as Record<string, unknown> | undefined)?.mindmapId
      if (typeof projectedId === 'string') {
        return projectedId
      }

      const committedId = (committedNode as Record<string, unknown> | undefined)?.mindmapId
      return typeof committedId === 'string'
        ? committedId
        : undefined
    })()
    const structureId = input.graph.mindmap.id(nodeId)

    return projectedOwner?.kind === 'mindmap'
      ? projectedOwner.id
      : committedOwner?.kind === 'mindmap'
        ? committedOwner.id
        : legacyMindmapId
          ?? structureId
  })

  const ids = [...new Set(resolved.filter(Boolean))]

  return ids.length === 1
    ? ids[0]
    : undefined
}

const readEdgeOrThrow = (
  graph: Pick<EditorSceneRuntime, 'edge'>,
  edgeId: string
) => {
  const edge = graph.edge.graph.get(edgeId)?.base.edge
  if (!edge) {
    throw new Error(`Edge ${edgeId} not found.`)
  }

  return edge
}

export type CreateEditorActionsApiDeps = {
  boundary: Pick<EditorBoundaryRuntime, 'atomic' | 'procedure'>
  engine: Engine
  document: EditorDocumentRuntimeSource
  session: EditorSession
  graph: EditorSceneRuntime
  layout: EditorLayout
  tool: ToolService
  write: EditorWrite
  registry: NodeRegistry
  defaults: EditorDefaults['templates']
}

export const createEditorActionsApi = ({
  boundary,
  engine,
  document,
  session,
  graph,
  layout,
  tool,
  write,
  registry,
  defaults
}: CreateEditorActionsApiDeps): EditorActions => {
  const selectionSession = createSelectionSession(session)
  const selectionSessionDeps = {
    replaceSelection: selectionSession.replace,
    clearSelection: selectionSession.clear
  }
  const selectionActionsCore = createSelectionActions({
    read: graph,
    canvas: write.canvas,
    group: write.group,
    node: write.node,
    session: selectionSessionDeps,
    defaults
  })
  const clipboard = createClipboardActions({
    editor: {
      documentSource: document,
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
  const mindmapProcedures = createMindmapActionProcedures({
    engine,
    graph,
    session,
    write,
    focusNode: ({ nodeId, behavior }) => {
      applyMindmapFocus({
        session,
        document,
        registry,
        nodeId,
        behavior
      })
    },
    focusRoot: ({ nodeId, focus }) => {
      applyMindmapRootFocus({
        session,
        document,
        registry,
        nodeId,
        focus
      })
    }
  })
  const { atomic, procedure } = boundary

  return {
    app: {
      replace: atomic((nextDocument) => write.document.replace(nextDocument))
    },
    tool: {
      set: atomic((nextTool) => tool.set(nextTool)),
      select: atomic(() => tool.select()),
      draw: atomic((mode) => tool.draw(mode)),
      edge: atomic((template) => tool.edge(template)),
      insert: atomic((template) => tool.insert(template)),
      hand: atomic(() => tool.hand())
    },
    viewport: {
      set: atomic((viewport) => session.viewport.commands.set(viewport)),
      panBy: atomic((delta) => session.viewport.commands.panBy(delta)),
      zoomTo: atomic((input) => session.viewport.commands.zoomTo(input)),
      fit: atomic((rect, options) => session.viewport.commands.fit(rect, options)),
      reset: atomic(() => session.viewport.commands.reset()),
      setRect: atomic((rect) => session.viewport.setRect(rect)),
      setLimits: atomic((limits) => session.viewport.setLimits(limits))
    },
    draw: {
      set: atomic((state) => session.mutate.draw.set(state)),
      slot: atomic((slot) => session.mutate.draw.slot(slot)),
      patch: atomic((patch) => session.mutate.draw.patch(patch))
    },
    selection: {
      replace: atomic((input) => selectionSession.replace(input)),
      add: atomic((input) => selectionSession.add(input)),
      remove: atomic((input) => selectionSession.remove(input)),
      toggle: atomic((input) => selectionSession.toggle(input)),
      selectAll: atomic(() => {
        applySelectionMutation(session, () => session.mutate.selection.replace({
          nodeIds: document.node.list.get(),
          edgeIds: document.edge.list.get()
        }))
      }),
      clear: atomic(() => selectionSession.clear()),
      frame: atomic((bounds, options) => selectionActionsCore.frame(bounds, options)),
      order: atomic((target, mode) => selectionActionsCore.order(target, mode)),
      group: atomic((target, options) => selectionActionsCore.group(target, options)),
      ungroup: atomic((target, options) => selectionActionsCore.ungroup(target, options)),
      delete: atomic((target, options) => selectionActionsCore.delete(target, options)),
      duplicate: atomic((target, options) => selectionActionsCore.duplicate(target, options))
    },
    edit: {
      startNode: atomic((nodeId, field, options) => {
        startNodeEdit({
          session,
          document,
          registry,
          nodeId,
          field,
          caret: options?.caret
        })
      }),
      startEdgeLabel: atomic((edgeId, labelId, options) => {
        startEdgeLabelEdit({
          session,
          document,
          edgeId,
          labelId,
          caret: options?.caret
        })
      }),
      input: atomic((text) => session.mutate.edit.input(text)),
      composing: atomic((composing) => session.mutate.edit.composing(composing)),
      caret: atomic((caret) => session.mutate.edit.caret(caret)),
      cancel: atomic(() => {
        const currentEdit = session.state.edit.get()
        if (!currentEdit) {
          return
        }

        session.mutate.edit.clear()

        if (currentEdit.kind === 'edge-label') {
          const committedLabel = document.edge.item.get(currentEdit.edgeId)?.edge.labels?.find(
            (label) => label.id === currentEdit.labelId
          )
          if (!committedLabel || committedLabel.text?.trim()) {
            return
          }

          write.edge.label.delete(currentEdit.edgeId, currentEdit.labelId)
        }
      }),
      commit: atomic(() => {
        const currentEdit = session.state.edit.get()
        if (!currentEdit) {
          return
        }

        if (currentEdit.kind === 'node') {
          const committed = document.node.committed.get(currentEdit.nodeId)
          if (!committed) {
            session.mutate.edit.clear()
            return
          }

          const capability = resolveNodeCapability({
            registry,
            nodeType: committed.node.type,
            field: currentEdit.field
          })
          if (!capability) {
            session.mutate.edit.clear()
            return
          }

          const draftLayout = layout.draft.node.get(currentEdit.nodeId)
          session.mutate.edit.clear()
          write.node.text.commit({
            nodeId: currentEdit.nodeId,
            field: currentEdit.field,
            value: resolveNodeCommitValue({
              text: currentEdit.text,
              empty: capability.empty,
              defaultText: capability.defaultText
            }),
            size: draftLayout?.kind === 'size'
              ? draftLayout.size
              : undefined,
            fontSize: draftLayout?.kind === 'fit'
              ? draftLayout.fontSize
              : undefined
          })
          return
        }

        session.mutate.edit.clear()

        if (!currentEdit.text.trim()) {
          write.edge.label.delete(currentEdit.edgeId, currentEdit.labelId)
          return
        }

        write.edge.label.update(
          currentEdit.edgeId,
          currentEdit.labelId,
          {
            fields: {
              text: currentEdit.text
            }
          }
        )
      })
    },
    node: {
      create: atomic((input) => write.node.create(input)),
      patch: atomic((ids, update, options) => {
        if (nodeApi.update.isEmpty(update)) {
          return undefined
        }

        const updates = ids.flatMap((id) => document.node.committed.get(id)
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
      }),
      move: atomic((input) => write.node.move(input)),
      align: atomic((ids, mode) => write.node.align(ids, mode)),
      distribute: atomic((ids, mode) => write.node.distribute(ids, mode)),
      delete: atomic((ids) => write.node.delete(ids)),
      duplicate: atomic((ids) => write.node.duplicate(ids)),
      lock: {
        set: atomic((nodeIds, locked) => write.node.lock.set(nodeIds, locked)),
        toggle: atomic((nodeIds) => write.node.lock.toggle(nodeIds))
      },
      shape: {
        set: atomic((nodeIds, kind) => write.node.shape.set(nodeIds, kind))
      },
      style: {
        fill: atomic((nodeIds, value) => write.node.style.fill(nodeIds, value)),
        fillOpacity: atomic((nodeIds, value) => write.node.style.fillOpacity(nodeIds, value)),
        stroke: atomic((nodeIds, value) => write.node.style.stroke(nodeIds, value)),
        strokeWidth: atomic((nodeIds, value) => write.node.style.strokeWidth(nodeIds, value)),
        strokeOpacity: atomic((nodeIds, value) => write.node.style.strokeOpacity(nodeIds, value)),
        strokeDash: atomic((nodeIds, value) => write.node.style.strokeDash(nodeIds, value)),
        opacity: atomic((nodeIds, value) => write.node.style.opacity(nodeIds, value)),
        textColor: atomic((nodeIds, value) => write.node.style.textColor(nodeIds, value))
      },
      text: {
        commit: atomic((input) => write.node.text.commit(input)),
        color: atomic((nodeIds, color) => write.node.text.color(nodeIds, color)),
        size: atomic((input) => write.node.text.size(input)),
        weight: atomic((nodeIds, weight) => write.node.text.weight(nodeIds, weight)),
        italic: atomic((nodeIds, italic) => write.node.text.italic(nodeIds, italic)),
        align: atomic((nodeIds, align) => write.node.text.align(nodeIds, align))
      }
    },
    edge: {
      create: atomic((input) => write.edge.create(input)),
      patch: atomic((edgeIds, patch) => {
        const input = toEdgeUpdateInput(patch)
        if (!input.fields && !input.records?.length) {
          return undefined
        }

        return write.edge.updateMany(
          edgeIds.flatMap((id) => document.edge.item.get(id)
            ? [{
                id,
                input
              }]
            : [])
        )
      }),
      move: atomic((input) => write.edge.move(input)),
      reconnectCommit: atomic((input) => write.edge.reconnectCommit(input)),
      delete: atomic((ids) => write.edge.delete(ids)),
      route: {
        set: atomic((edgeId, route) => write.edge.route.set(edgeId, route)),
        insertPoint: atomic((edgeId, index, point) => {
          const edge = readEdgeOrThrow(graph, edgeId)
          const inserted = edgeApi.route.insert(edge, index, point)
          if (!inserted.ok) {
            throw new Error(inserted.error.message)
          }

          return write.edge.route.set(edgeId, inserted.data.patch.route ?? {
            kind: 'auto'
          })
        }),
        movePoint: atomic((edgeId, index, point) => {
          const patch = edgeApi.route.move(
            readEdgeOrThrow(graph, edgeId),
            index,
            point
          )
          if (!patch) {
            throw new Error(`Edge route point ${edgeId}:${index} not found.`)
          }

          return write.edge.route.set(edgeId, patch.route ?? {
            kind: 'auto'
          })
        }),
        removePoint: atomic((edgeId, index) => {
          const patch = edgeApi.route.remove(
            readEdgeOrThrow(graph, edgeId),
            index
          )
          if (!patch) {
            throw new Error(`Edge route point ${edgeId}:${index} not found.`)
          }

          return write.edge.route.set(edgeId, patch.route ?? {
            kind: 'auto'
          })
        }),
        clear: atomic((edgeId) => write.edge.route.clear(edgeId))
      },
      label: {
        add: atomic((edgeId) => {
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
          startEdgeLabelEdit({
            session,
            document,
            edgeId,
            labelId
          })
          return labelId
        }),
        patch: atomic((edgeId, labelId, patch) => write.edge.label.update(
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
          )),
        remove: atomic((edgeId, labelId) => {
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
        })
      },
      style: {
        color: atomic((edgeIds, value) => write.edge.style.color(edgeIds, value)),
        opacity: atomic((edgeIds, value) => write.edge.style.opacity(edgeIds, value)),
        width: atomic((edgeIds, value) => write.edge.style.width(edgeIds, value)),
        dash: atomic((edgeIds, value) => write.edge.style.dash(edgeIds, value)),
        start: atomic((edgeIds, value) => write.edge.style.start(edgeIds, value)),
        end: atomic((edgeIds, value) => write.edge.style.end(edgeIds, value)),
        swapMarkers: atomic((edgeIds) => write.edge.style.swapMarkers(edgeIds))
      },
      type: {
        set: atomic((edgeIds, value) => write.edge.type.set(edgeIds, value))
      },
      lock: {
        set: atomic((edgeIds, locked) => write.edge.lock.set(edgeIds, locked)),
        toggle: atomic((edgeIds) => write.edge.lock.toggle(edgeIds))
      },
      textMode: {
        set: atomic((edgeIds, value) => write.edge.textMode.set(edgeIds, value))
      }
    },
    mindmap: {
      create: procedure(mindmapProcedures.create),
      delete: atomic((ids) => write.mindmap.delete(ids)),
      patch: atomic((id, input) => write.mindmap.layout.set(id, input.layout ?? {})),
      insert: procedure(mindmapProcedures.insert),
      moveSubtree: atomic((id, input) => write.mindmap.topic.move(id, input)),
      removeSubtree: atomic((id, input) => write.mindmap.topic.delete(id, input)),
      cloneSubtree: atomic((id, input) => write.mindmap.topic.clone(id, input)),
      insertRelative: procedure(mindmapProcedures.insertRelative),
      moveByDrop: atomic((input) => write.mindmap.topic.move(input.id, {
          nodeId: input.nodeId,
          parentId: input.drop.parentId,
          index: input.drop.index,
          side: input.drop.side
        })),
      moveRoot: atomic((input) => {
        const directNode = document.node.committed.get(input.nodeId)?.node
        const structure = graph.mindmap.structure(input.nodeId)
        const node = directNode ?? (
          structure
            ? document.node.committed.get(structure.rootId)?.node
            : undefined
        )
        const mindmapId = directNode?.owner?.kind === 'mindmap'
          ? directNode.owner.id
          : graph.mindmap.id(input.nodeId)
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
      }),
      style: {
        branch: atomic((input) => {
          const scopeIds = input.scope === 'subtree' && input.id
            ? graph.mindmap.structure(input.id)?.nodeIds ?? input.nodeIds
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
        }),
        topic: atomic((input) => {
          const mindmapId = readMindmapIdForNodes({
            document,
            graph,
            nodeIds: input.nodeIds
          })
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
        })
      }
    },
    clipboard: {
      copy: atomic((target = 'selection') => clipboard.copy(target)),
      cut: atomic((target = 'selection') => clipboard.cut(target)),
      paste: atomic((packet, options) => clipboard.paste(packet, options))
    },
    history: {
      undo: atomic(() => write.history.undo()),
      redo: atomic(() => write.history.redo()),
      clear: atomic(() => {
        write.history.clear()
      })
    }
  } satisfies {
    app: AppActions
    tool: ToolActions
    clipboard: ClipboardActions
    history: HistoryActions
  } & EditorActions
}
