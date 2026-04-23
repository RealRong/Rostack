import { json, scheduler, store } from '@shared/core'
import type {
  GraphSnapshot
} from '@whiteboard/editor-graph'
import type { SelectionInput } from '@whiteboard/core/selection'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  EdgePatch,
  MindmapId,
  MindmapInsertInput,
  MindmapNodeId,
  MindmapTopicData,
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
  MindmapInsertRelation,
  ToolActions
} from '@whiteboard/editor/action/types'
import {
  createClipboardActions
} from '@whiteboard/editor/action/clipboard'
import {
  createSelectionActions
} from '@whiteboard/editor/action/selection'
import type {
  EditorCommandContext
} from '@whiteboard/editor/command/context'
import type {
  EditorCommand,
  EditorCommandRunner,
  EditorCommandTree
} from '@whiteboard/editor/command/contracts'
import type {
  DocumentRead,
  MindmapStructureItem
} from '@whiteboard/editor/document/read'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import {
  createEmptyEditorGraphInputDelta,
  readActiveMindmapTickIds
} from '@whiteboard/editor/projection/input'
import type { GraphRead } from '@whiteboard/editor/read/graph'
import type { EditField } from '@whiteboard/editor/session/edit'
import type {
  MindmapEnterPreview,
  MindmapPreviewState
} from '@whiteboard/editor/session/preview/types'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { EditorWrite } from '@whiteboard/editor/write'

const DEFAULT_MINDMAP_ENTER_DURATION_MS = 220

export type EditorActionCommands = EditorCommandTree<
  EditorCommandContext,
  EditorActions
>

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

const startNodeEdit = ({
  session,
  document,
  registry,
  nodeId,
  field,
  caret
}: {
  session: Pick<EditorSession, 'mutate'>
  document: Pick<DocumentRead, 'node'>
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
  document: Pick<DocumentRead, 'edge'>
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
}

const removeMindmapEnterPreview = (
  session: Pick<EditorSession, 'preview'>,
  entry: Pick<MindmapEnterPreview, 'treeId' | 'nodeId'>
) => {
  withMindmapPreview(session, (current) => {
    if (!current) {
      return undefined
    }

    const nextEnter = current.enter?.filter((preview) => (
      preview.treeId !== entry.treeId || preview.nodeId !== entry.nodeId
    ))

    return {
      ...current,
      enter: nextEnter?.length ? nextEnter : undefined
    }
  })
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
  structure,
  graph,
  treeId,
  nodeId,
  anchorId
}: {
  structure: DocumentRead['mindmap']['structure']
  graph: GraphSnapshot
  treeId: MindmapId
  nodeId: MindmapNodeId
  anchorId?: MindmapNodeId
}): MindmapEnterPreview | undefined => {
  const currentStructure = structure.get(treeId)
  const computed = graph.owners.mindmaps.byId.get(treeId)?.tree.layout
  if (!currentStructure || !computed) {
    return undefined
  }

  const parentId = currentStructure.tree.nodes[nodeId]?.parentId
  const toRect = computed.node[nodeId]
  const anchorRect = computed.node[anchorId ?? parentId ?? '']
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
    startedAt: scheduler.readMonotonicNow(),
    durationMs: DEFAULT_MINDMAP_ENTER_DURATION_MS
  }
}

const applyMindmapFocus = ({
  session,
  document,
  registry,
  nodeId,
  behavior
}: {
  session: Pick<EditorSession, 'mutate'>
  document: Pick<DocumentRead, 'node'>
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
  document: Pick<DocumentRead, 'node'>
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
    document: Pick<DocumentRead, 'mindmap' | 'node'>
    graph: Pick<GraphRead, 'node'>
    nodeIds: readonly NodeId[]
  }
): MindmapId | undefined => {
  const resolved = input.nodeIds.map((nodeId) => {
    const projectedNode = input.graph.node.view.get(nodeId)?.base.node
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
    const structureId = input.document.mindmap.structure.get(nodeId)?.id
      ?? store.read(input.document.mindmap.list).find((mindmapId) => (
        input.document.mindmap.structure.get(mindmapId)?.nodeIds.includes(nodeId)
      ))

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

const readMindmapInsertSide = ({
  structure,
  targetNodeId,
  side
}: {
  structure: MindmapStructureItem
  targetNodeId: MindmapNodeId
  side?: 'left' | 'right'
}): 'left' | 'right' => {
  if (side) {
    return side
  }

  const targetSide = structure.tree.nodes[targetNodeId]?.side
  if (targetSide === 'left' || targetSide === 'right') {
    return targetSide
  }

  return structure.tree.layout.side === 'left'
    ? 'left'
    : 'right'
}

const buildMindmapRelativeInsertInput = ({
  structure,
  targetNodeId,
  relation,
  side,
  payload
}: {
  structure: MindmapStructureItem
  targetNodeId: MindmapNodeId
  relation: MindmapInsertRelation
  side?: 'left' | 'right'
  payload?: MindmapTopicData
}): MindmapInsertInput | undefined => {
  const anchorLayout = {
    ...structure.tree.layout,
    anchorId: targetNodeId
  }
  const isRoot = targetNodeId === structure.rootId
  const target = structure.tree.nodes[targetNodeId]

  if (!isRoot && !target) {
    return undefined
  }

  switch (relation) {
    case 'child':
      return {
        kind: 'child',
        parentId: targetNodeId,
        payload,
        options: {
          side: readMindmapInsertSide({
            structure,
            targetNodeId,
            side
          }),
          layout: anchorLayout
        }
      }
    case 'sibling':
      if (isRoot) {
        return {
          kind: 'child',
          parentId: targetNodeId,
          payload,
          options: {
            side: readMindmapInsertSide({
              structure,
              targetNodeId,
              side
            }),
            layout: anchorLayout
          }
        }
      }

      return {
        kind: 'sibling',
        nodeId: targetNodeId,
        position: 'after',
        payload,
        options: {
          layout: anchorLayout
        }
      }
    case 'parent':
      if (isRoot) {
        return undefined
      }

      return {
        kind: 'parent',
        nodeId: targetNodeId,
        payload,
        options: {
          layout: anchorLayout
        }
      }
  }
}

const readEdgeOrThrow = (
  graph: Pick<GraphRead, 'edge'>,
  edgeId: string
) => {
  const edge = graph.edge.view.get(edgeId)?.base.edge
  if (!edge) {
    throw new Error(`Edge ${edgeId} not found.`)
  }

  return edge
}

const createMindmapTickDelta = (
  ids: ReadonlySet<string>
) => {
  const delta = createEmptyEditorGraphInputDelta()
  delta.graph.mindmaps.tick = new Set(ids)
  return delta
}

const bindEditorActions = ({
  runner,
  commands
}: {
  runner: Pick<EditorCommandRunner<EditorCommandContext>, 'bind'>
  commands: EditorActionCommands
}): EditorActions => ({
  app: {
    replace: runner.bind(commands.app.replace)
  } satisfies AppActions,
  tool: {
    set: runner.bind(commands.tool.set),
    select: runner.bind(commands.tool.select),
    draw: runner.bind(commands.tool.draw),
    edge: runner.bind(commands.tool.edge),
    insert: runner.bind(commands.tool.insert),
    hand: runner.bind(commands.tool.hand)
  } satisfies ToolActions,
  viewport: {
    set: runner.bind(commands.viewport.set),
    panBy: runner.bind(commands.viewport.panBy),
    zoomTo: runner.bind(commands.viewport.zoomTo),
    fit: runner.bind(commands.viewport.fit),
    reset: runner.bind(commands.viewport.reset),
    setRect: runner.bind(commands.viewport.setRect),
    setLimits: runner.bind(commands.viewport.setLimits)
  },
  draw: {
    set: runner.bind(commands.draw.set),
    slot: runner.bind(commands.draw.slot),
    patch: runner.bind(commands.draw.patch)
  },
  selection: {
    replace: runner.bind(commands.selection.replace),
    add: runner.bind(commands.selection.add),
    remove: runner.bind(commands.selection.remove),
    toggle: runner.bind(commands.selection.toggle),
    selectAll: runner.bind(commands.selection.selectAll),
    clear: runner.bind(commands.selection.clear),
    duplicate: runner.bind(commands.selection.duplicate),
    delete: runner.bind(commands.selection.delete),
    order: runner.bind(commands.selection.order),
    group: runner.bind(commands.selection.group),
    ungroup: runner.bind(commands.selection.ungroup),
    frame: runner.bind(commands.selection.frame)
  },
  edit: {
    startNode: runner.bind(commands.edit.startNode),
    startEdgeLabel: runner.bind(commands.edit.startEdgeLabel),
    input: runner.bind(commands.edit.input),
    composing: runner.bind(commands.edit.composing),
    caret: runner.bind(commands.edit.caret),
    cancel: runner.bind(commands.edit.cancel),
    commit: runner.bind(commands.edit.commit)
  },
  node: {
    create: runner.bind(commands.node.create),
    patch: runner.bind(commands.node.patch),
    move: runner.bind(commands.node.move),
    align: runner.bind(commands.node.align),
    distribute: runner.bind(commands.node.distribute),
    delete: runner.bind(commands.node.delete),
    duplicate: runner.bind(commands.node.duplicate),
    lock: {
      set: runner.bind(commands.node.lock.set),
      toggle: runner.bind(commands.node.lock.toggle)
    },
    shape: {
      set: runner.bind(commands.node.shape.set)
    },
    style: {
      fill: runner.bind(commands.node.style.fill),
      fillOpacity: runner.bind(commands.node.style.fillOpacity),
      stroke: runner.bind(commands.node.style.stroke),
      strokeWidth: runner.bind(commands.node.style.strokeWidth),
      strokeOpacity: runner.bind(commands.node.style.strokeOpacity),
      strokeDash: runner.bind(commands.node.style.strokeDash),
      opacity: runner.bind(commands.node.style.opacity),
      textColor: runner.bind(commands.node.style.textColor)
    },
    text: {
      commit: runner.bind(commands.node.text.commit),
      color: runner.bind(commands.node.text.color),
      size: runner.bind(commands.node.text.size),
      weight: runner.bind(commands.node.text.weight),
      italic: runner.bind(commands.node.text.italic),
      align: runner.bind(commands.node.text.align)
    }
  },
  edge: {
    create: runner.bind(commands.edge.create),
    patch: runner.bind(commands.edge.patch),
    move: runner.bind(commands.edge.move),
    reconnectCommit: runner.bind(commands.edge.reconnectCommit),
    delete: runner.bind(commands.edge.delete),
    route: {
      set: runner.bind(commands.edge.route.set),
      insertPoint: runner.bind(commands.edge.route.insertPoint),
      movePoint: runner.bind(commands.edge.route.movePoint),
      removePoint: runner.bind(commands.edge.route.removePoint),
      clear: runner.bind(commands.edge.route.clear)
    },
    label: {
      add: runner.bind(commands.edge.label.add),
      patch: runner.bind(commands.edge.label.patch),
      remove: runner.bind(commands.edge.label.remove)
    },
    style: {
      color: runner.bind(commands.edge.style.color),
      opacity: runner.bind(commands.edge.style.opacity),
      width: runner.bind(commands.edge.style.width),
      dash: runner.bind(commands.edge.style.dash),
      start: runner.bind(commands.edge.style.start),
      end: runner.bind(commands.edge.style.end),
      swapMarkers: runner.bind(commands.edge.style.swapMarkers)
    },
    type: {
      set: runner.bind(commands.edge.type.set)
    },
    lock: {
      set: runner.bind(commands.edge.lock.set),
      toggle: runner.bind(commands.edge.lock.toggle)
    },
    textMode: {
      set: runner.bind(commands.edge.textMode.set)
    }
  },
  mindmap: {
    create: runner.bind(commands.mindmap.create),
    delete: runner.bind(commands.mindmap.delete),
    patch: runner.bind(commands.mindmap.patch),
    insert: runner.bind(commands.mindmap.insert),
    moveSubtree: runner.bind(commands.mindmap.moveSubtree),
    removeSubtree: runner.bind(commands.mindmap.removeSubtree),
    cloneSubtree: runner.bind(commands.mindmap.cloneSubtree),
    insertRelative: runner.bind(commands.mindmap.insertRelative),
    moveByDrop: runner.bind(commands.mindmap.moveByDrop),
    moveRoot: runner.bind(commands.mindmap.moveRoot),
    style: {
      branch: runner.bind(commands.mindmap.style.branch),
      topic: runner.bind(commands.mindmap.style.topic)
    }
  },
  clipboard: {
    copy: runner.bind(commands.clipboard.copy),
    cut: runner.bind(commands.clipboard.cut),
    paste: runner.bind(commands.clipboard.paste)
  } satisfies ClipboardActions,
  history: {
    undo: runner.bind(commands.history.undo),
    redo: runner.bind(commands.history.redo),
    clear: runner.bind(commands.history.clear)
  } satisfies HistoryActions
})

export const createEditorActionCommands = ({
  document,
  session,
  graph,
  layout,
  write,
  registry,
  defaults
}: {
  document: DocumentRead
  session: EditorSession
  graph: GraphRead
  layout: EditorLayout
  write: EditorWrite
  registry: NodeRegistry
  defaults: EditorDefaults['templates']
}): EditorActionCommands => {
  const selectionSession = createSelectionSession(session)
  const selectionSessionDeps = {
    replaceSelection: selectionSession.replace,
    clearSelection: selectionSession.clear
  }
  const selectionActionsCore = createSelectionActions({
    read: document,
    canvas: write.canvas,
    group: write.group,
    node: write.node,
    session: selectionSessionDeps,
    defaults
  })
  const clipboard = createClipboardActions({
    editor: {
      read: document,
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
  const mindmapEnterAnimation = {
    active: false
  }

  const readActiveMindmapIds = (
    ctx: EditorCommandContext
  ) => readActiveMindmapTickIds({
    snapshot: ctx.engine.current().snapshot,
    preview: ctx.session.preview.state.get().mindmap.preview
  })

  const tickMindmapEnter = function* (
    ctx: EditorCommandContext
  ): EditorCommand<void> {
    const activeMindmapIds = readActiveMindmapIds(ctx)
    if (activeMindmapIds.size === 0) {
      mindmapEnterAnimation.active = false
      return
    }

    yield ctx.publish(createMindmapTickDelta(activeMindmapIds))

    if (readActiveMindmapIds(ctx).size === 0) {
      mindmapEnterAnimation.active = false
      return
    }

    yield ctx.task.frame(tickMindmapEnter(ctx))
  }

  const ensureMindmapEnterAnimation = function* (
    ctx: EditorCommandContext
  ): EditorCommand<void> {
    if (mindmapEnterAnimation.active || readActiveMindmapIds(ctx).size === 0) {
      return
    }

    mindmapEnterAnimation.active = true
    yield ctx.task.frame(tickMindmapEnter(ctx))
  }

  const removeMindmapEnter = function* (
    ctx: EditorCommandContext,
    entry: Pick<MindmapEnterPreview, 'treeId' | 'nodeId'>
  ): EditorCommand<void> {
    removeMindmapEnterPreview(ctx.session, entry)
  }

  const focusMindmapNode = function* (
    ctx: EditorCommandContext,
    input: {
      nodeId: MindmapNodeId
      behavior: MindmapInsertBehavior | undefined
      delayMs?: number
    }
  ): EditorCommand<void> {
    const delayMs = input.delayMs ?? 0
    if (delayMs > 0) {
      yield ctx.task.delay(
        delayMs,
        focusMindmapNode(ctx, {
          ...input,
          delayMs: 0
        })
      )
      return
    }

    applyMindmapFocus({
      session: ctx.session,
      document: ctx.document,
      registry,
      nodeId: input.nodeId,
      behavior: input.behavior
    })
  }

  const focusMindmapRoot = function* (
    ctx: EditorCommandContext,
    input: {
      nodeId: MindmapNodeId
      focus: 'edit-root' | 'select-root' | 'none' | undefined
    }
  ): EditorCommand<void> {
    applyMindmapRootFocus({
      session: ctx.session,
      document: ctx.document,
      registry,
      nodeId: input.nodeId,
      focus: input.focus
    })
  }

  const setTool = function* (
    ctx: EditorCommandContext,
    nextTool: Tool
  ): EditorCommand<void> {
    const currentTool = ctx.session.state.tool.get()
    const toolChanged = !isSameTool(currentTool, nextTool)

    if (toolChanged || nextTool.type === 'draw') {
      ctx.session.mutate.edit.clear()
      ctx.session.mutate.selection.clear()
    }

    if (!toolChanged) {
      return
    }

    ctx.session.mutate.tool.set(nextTool)
  }

  return {
    app: {
      replace: function* (ctx, nextDocument) {
        return ctx.write.document.replace(nextDocument)
      }
    },
    tool: {
      set: setTool,
      select: function* (ctx) {
        yield* setTool(ctx, {
          type: 'select'
        })
      },
      draw: function* (ctx, mode) {
        ctx.session.mutate.tool.set({ type: 'draw', mode })
        ctx.session.mutate.edit.clear()
        ctx.session.mutate.selection.clear()
      },
      edge: function* (ctx, template) {
        yield* setTool(ctx, {
          type: 'edge' as const,
          template
        })
      },
      insert: function* (ctx, template) {
        yield* setTool(ctx, {
          type: 'insert' as const,
          template
        })
      },
      hand: function* (ctx) {
        yield* setTool(ctx, {
          type: 'hand'
        })
      }
    },
    viewport: {
      set: function* (ctx, viewport) {
        ctx.session.viewport.commands.set(viewport)
      },
      panBy: function* (ctx, delta) {
        ctx.session.viewport.commands.panBy(delta)
      },
      zoomTo: function* (ctx, input) {
        ctx.session.viewport.commands.zoomTo(input)
      },
      fit: function* (ctx, rect, options) {
        ctx.session.viewport.commands.fit(rect, options)
      },
      reset: function* (ctx) {
        ctx.session.viewport.commands.reset()
      },
      setRect: function* (ctx, rect) {
        ctx.session.viewport.setRect(rect)
      },
      setLimits: function* (ctx, limits) {
        ctx.session.viewport.setLimits(limits)
      }
    },
    draw: {
      set: function* (ctx, state) {
        ctx.session.mutate.draw.set(state)
      },
      slot: function* (ctx, slot) {
        ctx.session.mutate.draw.slot(slot)
      },
      patch: function* (ctx, patch) {
        ctx.session.mutate.draw.patch(patch)
      }
    },
    selection: {
      replace: function* (_ctx, input) {
        selectionSession.replace(input)
      },
      add: function* (_ctx, input) {
        selectionSession.add(input)
      },
      remove: function* (_ctx, input) {
        selectionSession.remove(input)
      },
      toggle: function* (_ctx, input) {
        selectionSession.toggle(input)
      },
      selectAll: function* (ctx) {
        applySelectionMutation(ctx.session, () => ctx.session.mutate.selection.replace({
          nodeIds: ctx.document.node.list.get(),
          edgeIds: ctx.document.edge.list.get()
        }))
      },
      clear: function* (_ctx) {
        selectionSession.clear()
      },
      frame: function* (_ctx, bounds, options) {
        return selectionActionsCore.frame(bounds, options)
      },
      order: function* (_ctx, target, mode) {
        return selectionActionsCore.order(target, mode)
      },
      group: function* (_ctx, target, options) {
        return selectionActionsCore.group(target, options)
      },
      ungroup: function* (_ctx, target, options) {
        return selectionActionsCore.ungroup(target, options)
      },
      delete: function* (_ctx, target, options) {
        return selectionActionsCore.delete(target, options)
      },
      duplicate: function* (_ctx, target, options) {
        return selectionActionsCore.duplicate(target, options)
      }
    },
    edit: {
      startNode: function* (ctx, nodeId, field, options) {
        startNodeEdit({
          session: ctx.session,
          document: ctx.document,
          registry,
          nodeId,
          field,
          caret: options?.caret
        })
      },
      startEdgeLabel: function* (ctx, edgeId, labelId, options) {
        startEdgeLabelEdit({
          session: ctx.session,
          document: ctx.document,
          edgeId,
          labelId,
          caret: options?.caret
        })
      },
      input: function* (ctx, text) {
        ctx.session.mutate.edit.input(text)
      },
      composing: function* (ctx, composing) {
        ctx.session.mutate.edit.composing(composing)
      },
      caret: function* (ctx, caret) {
        ctx.session.mutate.edit.caret(caret)
      },
      cancel: function* (ctx) {
        const currentEdit = ctx.session.state.edit.get()
        if (!currentEdit) {
          return
        }

        ctx.session.mutate.edit.clear()

        if (currentEdit.kind === 'edge-label') {
          const committedLabel = ctx.document.edge.item.get(currentEdit.edgeId)?.edge.labels?.find(
            (label) => label.id === currentEdit.labelId
          )
          if (!committedLabel || committedLabel.text?.trim()) {
            return
          }

          ctx.write.edge.label.delete(currentEdit.edgeId, currentEdit.labelId)
        }
      },
      commit: function* (ctx) {
        const currentEdit = ctx.session.state.edit.get()
        if (!currentEdit) {
          return
        }

        if (currentEdit.kind === 'node') {
          const committed = ctx.document.node.committed.get(currentEdit.nodeId)
          if (!committed) {
            ctx.session.mutate.edit.clear()
            return
          }

          const capability = resolveNodeCapability({
            registry,
            nodeType: committed.node.type,
            field: currentEdit.field
          })
          if (!capability) {
            ctx.session.mutate.edit.clear()
            return
          }

          const draftLayout = ctx.layout.draft.node.get(currentEdit.nodeId)
          ctx.session.mutate.edit.clear()
          ctx.write.node.text.commit({
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

        ctx.session.mutate.edit.clear()

        if (!currentEdit.text.trim()) {
          ctx.write.edge.label.delete(currentEdit.edgeId, currentEdit.labelId)
          return
        }

        ctx.write.edge.label.update(
          currentEdit.edgeId,
          currentEdit.labelId,
          {
            fields: {
              text: currentEdit.text
            }
          }
        )
      }
    },
    node: {
      create: function* (ctx, input) {
        return ctx.write.node.create(input)
      },
      patch: function* (ctx, ids, update, options) {
        if (nodeApi.update.isEmpty(update)) {
          return undefined
        }

        const updates = ids.flatMap((id) => ctx.document.node.committed.get(id)
          ? [{
              id,
              input: update
            }]
          : [])
        if (!updates.length) {
          return undefined
        }

        return ctx.write.node.updateMany(updates, {
          origin: options?.origin
        })
      },
      move: function* (ctx, input) {
        return ctx.write.node.move(input)
      },
      align: function* (ctx, ids, mode) {
        return ctx.write.node.align(ids, mode)
      },
      distribute: function* (ctx, ids, mode) {
        return ctx.write.node.distribute(ids, mode)
      },
      delete: function* (ctx, ids) {
        return ctx.write.node.delete(ids)
      },
      duplicate: function* (ctx, ids) {
        return ctx.write.node.duplicate(ids)
      },
      lock: {
        set: function* (ctx, nodeIds, locked) {
          return ctx.write.node.lock.set(nodeIds, locked)
        },
        toggle: function* (ctx, nodeIds) {
          return ctx.write.node.lock.toggle(nodeIds)
        }
      },
      shape: {
        set: function* (ctx, nodeIds, kind) {
          return ctx.write.node.shape.set(nodeIds, kind)
        }
      },
      style: {
        fill: function* (ctx, nodeIds, value) {
          return ctx.write.node.style.fill(nodeIds, value)
        },
        fillOpacity: function* (ctx, nodeIds, value) {
          return ctx.write.node.style.fillOpacity(nodeIds, value)
        },
        stroke: function* (ctx, nodeIds, value) {
          return ctx.write.node.style.stroke(nodeIds, value)
        },
        strokeWidth: function* (ctx, nodeIds, value) {
          return ctx.write.node.style.strokeWidth(nodeIds, value)
        },
        strokeOpacity: function* (ctx, nodeIds, value) {
          return ctx.write.node.style.strokeOpacity(nodeIds, value)
        },
        strokeDash: function* (ctx, nodeIds, value) {
          return ctx.write.node.style.strokeDash(nodeIds, value)
        },
        opacity: function* (ctx, nodeIds, value) {
          return ctx.write.node.style.opacity(nodeIds, value)
        },
        textColor: function* (ctx, nodeIds, value) {
          return ctx.write.node.style.textColor(nodeIds, value)
        }
      },
      text: {
        commit: function* (ctx, input) {
          return ctx.write.node.text.commit(input)
        },
        color: function* (ctx, nodeIds, color) {
          return ctx.write.node.text.color(nodeIds, color)
        },
        size: function* (ctx, input) {
          return ctx.write.node.text.size(input)
        },
        weight: function* (ctx, nodeIds, weight) {
          return ctx.write.node.text.weight(nodeIds, weight)
        },
        italic: function* (ctx, nodeIds, italic) {
          return ctx.write.node.text.italic(nodeIds, italic)
        },
        align: function* (ctx, nodeIds, align) {
          return ctx.write.node.text.align(nodeIds, align)
        }
      }
    },
    edge: {
      create: function* (ctx, input) {
        return ctx.write.edge.create(input)
      },
      patch: function* (ctx, edgeIds, patch) {
        const input = toEdgeUpdateInput(patch)
        if (!input.fields && !input.records?.length) {
          return undefined
        }

        return ctx.write.edge.updateMany(
          edgeIds.flatMap((id) => ctx.document.edge.item.get(id)
            ? [{
                id,
                input
              }]
            : [])
        )
      },
      move: function* (ctx, input) {
        return ctx.write.edge.move(input)
      },
      reconnectCommit: function* (ctx, input) {
        return ctx.write.edge.reconnectCommit(input)
      },
      delete: function* (ctx, ids) {
        return ctx.write.edge.delete(ids)
      },
      route: {
        set: function* (ctx, edgeId, route) {
          return ctx.write.edge.route.set(edgeId, route)
        },
        insertPoint: function* (ctx, edgeId, index, point) {
          const edge = readEdgeOrThrow(ctx.graph, edgeId)
          const inserted = edgeApi.route.insert(edge, index, point)
          if (!inserted.ok) {
            throw new Error(inserted.error.message)
          }

          return ctx.write.edge.route.set(edgeId, inserted.data.patch.route ?? {
            kind: 'auto'
          })
        },
        movePoint: function* (ctx, edgeId, index, point) {
          const patch = edgeApi.route.move(
            readEdgeOrThrow(ctx.graph, edgeId),
            index,
            point
          )
          if (!patch) {
            throw new Error(`Edge route point ${edgeId}:${index} not found.`)
          }

          return ctx.write.edge.route.set(edgeId, patch.route ?? {
            kind: 'auto'
          })
        },
        removePoint: function* (ctx, edgeId, index) {
          const patch = edgeApi.route.remove(
            readEdgeOrThrow(ctx.graph, edgeId),
            index
          )
          if (!patch) {
            throw new Error(`Edge route point ${edgeId}:${index} not found.`)
          }

          return ctx.write.edge.route.set(edgeId, patch.route ?? {
            kind: 'auto'
          })
        },
        clear: function* (ctx, edgeId) {
          return ctx.write.edge.route.clear(edgeId)
        }
      },
      label: {
        add: function* (ctx, edgeId) {
          const currentEdit = ctx.session.state.edit.get()
          if (
            currentEdit
            && currentEdit.kind === 'edge-label'
            && currentEdit.edgeId === edgeId
          ) {
            return undefined
          }

          const inserted = ctx.write.edge.label.insert(edgeId)
          if (!inserted.ok) {
            return undefined
          }
          const labelId = inserted.data.labelId

          selectionSession.replace({
            edgeIds: [edgeId]
          })
          startEdgeLabelEdit({
            session: ctx.session,
            document: ctx.document,
            edgeId,
            labelId
          })
          return labelId
        },
        patch: function* (ctx, edgeId, labelId, patch) {
          return ctx.write.edge.label.update(
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
          )
        },
        remove: function* (ctx, edgeId, labelId) {
          const currentEdit = ctx.session.state.edit.get()
          if (
            currentEdit
            && currentEdit.kind === 'edge-label'
            && currentEdit.edgeId === edgeId
            && currentEdit.labelId === labelId
          ) {
            ctx.session.mutate.edit.clear()
          }

          return ctx.write.edge.label.delete(edgeId, labelId)
        }
      },
      style: {
        color: function* (ctx, edgeIds, value) {
          return ctx.write.edge.style.color(edgeIds, value)
        },
        opacity: function* (ctx, edgeIds, value) {
          return ctx.write.edge.style.opacity(edgeIds, value)
        },
        width: function* (ctx, edgeIds, value) {
          return ctx.write.edge.style.width(edgeIds, value)
        },
        dash: function* (ctx, edgeIds, value) {
          return ctx.write.edge.style.dash(edgeIds, value)
        },
        start: function* (ctx, edgeIds, value) {
          return ctx.write.edge.style.start(edgeIds, value)
        },
        end: function* (ctx, edgeIds, value) {
          return ctx.write.edge.style.end(edgeIds, value)
        },
        swapMarkers: function* (ctx, edgeIds) {
          return ctx.write.edge.style.swapMarkers(edgeIds)
        }
      },
      type: {
        set: function* (ctx, edgeIds, value) {
          return ctx.write.edge.type.set(edgeIds, value)
        }
      },
      lock: {
        set: function* (ctx, edgeIds, locked) {
          return ctx.write.edge.lock.set(edgeIds, locked)
        },
        toggle: function* (ctx, edgeIds) {
          return ctx.write.edge.lock.toggle(edgeIds)
        }
      },
      textMode: {
        set: function* (ctx, edgeIds, value) {
          return ctx.write.edge.textMode.set(edgeIds, value)
        }
      }
    },
    mindmap: {
      create: function* (ctx, payload, options) {
        const result = ctx.write.mindmap.create(payload)
        if (result.ok) {
          yield* focusMindmapRoot(ctx, {
            nodeId: result.data.rootId,
            focus: options?.focus
          })
        }
        return result
      },
      delete: function* (ctx, ids) {
        return ctx.write.mindmap.delete(ids)
      },
      patch: function* (ctx, id, input) {
        return ctx.write.mindmap.layout.set(id, input.layout ?? {})
      },
      insert: function* (ctx, id, input, options) {
        const result = ctx.write.mindmap.topic.insert(id, input)
        if (!result.ok) {
          return result
        }

        let focusDelayMs = 0
        if (options?.behavior?.enter === 'from-anchor') {
          const published = yield ctx.publish()
          const preview = buildMindmapEnterPreview({
            structure: ctx.document.mindmap.structure,
            graph: published.graph,
            treeId: id,
            nodeId: result.data.nodeId,
            anchorId: readInsertAnchorId(input)
          })
          if (preview) {
            focusDelayMs = preview.durationMs
            appendMindmapEnterPreview(ctx.session, preview)
            yield ctx.task.delay(
              preview.durationMs + 34,
              removeMindmapEnter(ctx, preview)
            )
            yield* ensureMindmapEnterAnimation(ctx)
          }
        }

        yield* focusMindmapNode(ctx, {
          nodeId: result.data.nodeId,
          behavior: options?.behavior,
          delayMs: focusDelayMs
        })
        return result
      },
      moveSubtree: function* (ctx, id, input) {
        return ctx.write.mindmap.topic.move(id, input)
      },
      removeSubtree: function* (ctx, id, input) {
        return ctx.write.mindmap.topic.delete(id, input)
      },
      cloneSubtree: function* (ctx, id, input) {
        return ctx.write.mindmap.topic.clone(id, input)
      },
      insertRelative: function* (ctx, input) {
        const structure = ctx.document.mindmap.structure.get(input.id)
        if (!structure) {
          return undefined
        }

        const insertInput = buildMindmapRelativeInsertInput({
          structure,
          targetNodeId: input.targetNodeId,
          relation: input.relation,
          side: input.side,
          payload: input.payload
        })
        if (!insertInput) {
          return undefined
        }

        const result = ctx.write.mindmap.topic.insert(input.id, insertInput)
        if (!result.ok) {
          return result
        }

        let focusDelayMs = 0
        if (input.behavior?.enter === 'from-anchor') {
          const published = yield ctx.publish()
          const preview = buildMindmapEnterPreview({
            structure: ctx.document.mindmap.structure,
            graph: published.graph,
            treeId: input.id,
            nodeId: result.data.nodeId,
            anchorId: input.targetNodeId
          })
          if (preview) {
            focusDelayMs = preview.durationMs
            appendMindmapEnterPreview(ctx.session, preview)
            yield ctx.task.delay(
              preview.durationMs + 34,
              removeMindmapEnter(ctx, preview)
            )
            yield* ensureMindmapEnterAnimation(ctx)
          }
        }

        yield* focusMindmapNode(ctx, {
          nodeId: result.data.nodeId,
          behavior: input.behavior,
          delayMs: focusDelayMs
        })
        return result
      },
      moveByDrop: function* (ctx, input) {
        return ctx.write.mindmap.topic.move(input.id, {
          nodeId: input.nodeId,
          parentId: input.drop.parentId,
          index: input.drop.index,
          side: input.drop.side
        })
      },
      moveRoot: function* (ctx, input) {
        const directNode = ctx.document.node.committed.get(input.nodeId)?.node
        const structure = ctx.document.mindmap.structure.get(input.nodeId)
        const node = directNode ?? (
          structure
            ? ctx.document.node.committed.get(structure.rootId)?.node
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

        return ctx.write.mindmap.move(mindmapId, input.position)
      },
      style: {
        branch: function* (ctx, input) {
          const scopeIds = input.scope === 'subtree' && input.id
            ? ctx.document.mindmap.structure.get(input.id)?.nodeIds ?? input.nodeIds
            : input.nodeIds

          return ctx.write.mindmap.branch.update(
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
        topic: function* (ctx, input) {
          const mindmapId = readMindmapIdForNodes({
            document: ctx.document,
            graph: ctx.graph,
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

          return ctx.write.mindmap.topic.update(
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
    },
    clipboard: {
      copy: function* (_ctx, target = 'selection') {
        return clipboard.copy(target)
      },
      cut: function* (_ctx, target = 'selection') {
        return clipboard.cut(target)
      },
      paste: function* (_ctx, packet, options) {
        return clipboard.paste(packet, options)
      }
    },
    history: {
      undo: function* (ctx) {
        return ctx.write.history.undo()
      },
      redo: function* (ctx) {
        return ctx.write.history.redo()
      },
      clear: function* (ctx) {
        ctx.write.history.clear()
      }
    }
  }
}

export const createEditorActions = ({
  runner,
  commands
}: {
  runner: Pick<EditorCommandRunner<EditorCommandContext>, 'bind'>
  commands: EditorActionCommands
}): EditorActions => bindEditorActions({
  runner,
  commands
})
