import { json } from '@shared/core'
import {
  record as draftRecord,
  type RecordWrite
} from '@shared/draft'
import { err, ok } from '@whiteboard/core/utils/result'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  MindmapBranchFieldPatch,
  MindmapId,
  MindmapLayoutSpec,
  MindmapRecord,
  MindmapSnapshot,
  MindmapTopicFieldPatch,
  MindmapTopicInsertInput,
  MindmapTopicMoveInput,
  MindmapTopicSnapshot,
  Node,
  NodeId,
  Point,
  Result,
  ResultCode
} from '@whiteboard/core/types'
import {
  captureEdge,
  cloneBranchStyle,
  cloneCanvasSlot,
  cloneLayoutPatch,
  cloneMindmap,
  cloneMindmapMember,
  cloneNode,
  clonePoint,
  collectConnectedEdges,
  enqueueMindmapLayout,
  getMindmap,
  getMindmapTree,
  getNode,
  markCanvasOrderTouched,
  markEdgeRemoved,
  markMindmapAdded,
  markMindmapRemoved,
  markMindmapUpdated,
  markNodeAdded,
  markNodeRemoved,
  markNodeUpdated,
  type WhiteboardReduceState
} from './state'
import {
  appendCanvasRef,
  captureCanvasSlot,
  insertCanvasSlot,
  removeCanvasRef
} from './canvas'

const MAX_LAYOUT_STEPS = 100
const MAX_LAYOUT_REPEAT = 10

const TOPIC_PATCH_FIELDS = [
  'size',
  'rotation',
  'locked'
] as const

const BRANCH_PATCH_FIELDS = [
  'color',
  'line',
  'width',
  'stroke'
] as const

const hasOwn = <T extends object>(
  value: T,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(value, key)

const applyTopicFieldPatch = (
  node: Node,
  fields?: MindmapTopicFieldPatch
): Node => {
  if (!fields) {
    return node
  }

  let next = node
  TOPIC_PATCH_FIELDS.forEach((field) => {
    if (!hasOwn(fields, field)) {
      return
    }

    next = {
      ...next,
      [field]: json.clone(fields[field])
    }
  })
  return next
}

const captureMindmapSnapshot = (
  state: WhiteboardReduceState,
  id: MindmapId
): MindmapSnapshot => {
  const mindmap = getMindmap(state.draft, id)
  const tree = getMindmapTree(state.draft, id)
  if (!mindmap || !tree) {
    throw new Error(`Mindmap ${id} not found.`)
  }

  const nodeIds = new Set(mindmapApi.tree.subtreeIds(tree, tree.rootNodeId))
  const nodes = [...nodeIds].map((nodeId) => cloneNode(getNode(state.draft, nodeId)!))
  return {
    mindmap: cloneMindmap(mindmap),
    nodes,
    slot: cloneCanvasSlot(captureCanvasSlot(state, {
      kind: 'mindmap',
      id
    }))
  }
}

const captureMindmapTopicSnapshot = (
  state: WhiteboardReduceState,
  id: MindmapId,
  rootId: NodeId
): MindmapTopicSnapshot => {
  const current = getMindmap(state.draft, id)
  const tree = getMindmapTree(state.draft, id)
  if (!current || !tree) {
    throw new Error(`Mindmap ${id} not found.`)
  }

  const rootMember = current.members[rootId]
  const parentId = rootMember?.parentId
  if (!parentId) {
    throw new Error(`Topic ${rootId} parent missing.`)
  }

  const siblings = current.children[parentId] ?? []
  const index = siblings.indexOf(rootId)
  const nodeIds = new Set(mindmapApi.tree.subtreeIds(tree, rootId))
  const nodes = [...nodeIds].map((nodeId) => cloneNode(getNode(state.draft, nodeId)!))
  const members: MindmapRecord['members'] = Object.fromEntries(
    [...nodeIds].map((nodeId) => [
      nodeId,
      cloneMindmapMember(current.members[nodeId])!
    ])
  ) as MindmapRecord['members']
  const children = Object.fromEntries(
    [...nodeIds].map((nodeId) => [
      nodeId,
      [...(current.children[nodeId] ?? [])]
    ])
  )

  return {
    root: rootId,
    slot: {
      parent: parentId,
      prev: index > 0
        ? siblings[index - 1]
        : undefined,
      next: index >= 0
        ? siblings[index + 1]
        : undefined
    },
    nodes,
    members,
    children
  }
}

const relayoutMindmap = (
  state: WhiteboardReduceState,
  id: MindmapId
): void => {
  const record = getMindmap(state.draft, id)
  const tree = getMindmapTree(state.draft, id)
  if (!record || !tree) {
    return
  }

  const root = getNode(state.draft, record.root)
  if (!root) {
    return
  }

  const layout = mindmapApi.layout.compute(
    tree,
    (nodeId) => {
      const node = getNode(state.draft, nodeId)
      return {
        width: Math.max(node?.size?.width ?? 1, 1),
        height: Math.max(node?.size?.height ?? 1, 1)
      }
    },
    tree.layout
  )
  const anchored = mindmapApi.layout.anchor({
    tree,
    computed: layout,
    position: root.position
  })

  Object.entries(anchored.node).forEach(([nodeId, rect]) => {
    const current = getNode(state.draft, nodeId)
    if (!current) {
      return
    }

    state.draft.nodes.set(nodeId, {
      ...current,
      position: {
        x: rect.x,
        y: rect.y
      },
      size: {
        width: rect.width,
        height: rect.height
      }
    })
  })
}

const removeMindmapNode = (
  state: WhiteboardReduceState,
  nodeId: NodeId
): boolean => {
  state.draft.nodes.delete(nodeId)
  const hasCanvasRef = state.draft.canvasOrder.current().some((ref) => ref.kind === 'node' && ref.id === nodeId)
  if (hasCanvasRef) {
    state.draft.canvasOrder.set(removeCanvasRef(state.draft.canvasOrder.current(), {
      kind: 'node',
      id: nodeId
    }))
  }
  markNodeRemoved(state, nodeId)
  return hasCanvasRef
}

export const flushMindmapLayout = (
  state: WhiteboardReduceState
): Result<void, ResultCode> => {
  const repeats = new Map<MindmapId, number>()
  let steps = 0

  while (state.queue.mindmapLayout.length > 0) {
    const id = state.queue.mindmapLayout.shift()!
    state.queue.mindmapLayoutSet.delete(id)

    if (steps >= MAX_LAYOUT_STEPS) {
      return err('internal', 'Reconcile budget exceeded.', {
        reason: 'reconcile_budget_exceeded'
      })
    }

    const count = (repeats.get(id) ?? 0) + 1
    repeats.set(id, count)
    if (count > MAX_LAYOUT_REPEAT) {
      return err('internal', 'Reconcile cycle detected.', {
        reason: 'reconcile_cycle'
      })
    }

    relayoutMindmap(state, id)
    const record = getMindmap(state.draft, id)
    const tree = getMindmapTree(state.draft, id)
    if (record && tree) {
      mindmapApi.tree.subtreeIds(tree, record.root).forEach((nodeId) => {
        markNodeUpdated(state, nodeId)
      })
    }

    steps += 1
  }

  return ok(undefined)
}

export const createMindmap = (
  state: WhiteboardReduceState,
  input: {
    mindmap: MindmapRecord
    nodes: readonly Node[]
  }
): void => {
  state.draft.mindmaps.set(input.mindmap.id, input.mindmap)
  state.draft.canvasOrder.set(appendCanvasRef(state.draft.canvasOrder.current(), {
    kind: 'mindmap',
    id: input.mindmap.id
  }))
  state.inverse.prepend({
    type: 'mindmap.delete',
    id: input.mindmap.id
  })
  markMindmapAdded(state, input.mindmap.id)
  input.nodes.forEach((node) => {
    state.draft.nodes.set(node.id, node)
    markNodeAdded(state, node.id)
  })
  markCanvasOrderTouched(state)
  enqueueMindmapLayout(state, input.mindmap.id)
}

export const restoreMindmap = (
  state: WhiteboardReduceState,
  snapshot: MindmapSnapshot
): void => {
  state.draft.mindmaps.set(snapshot.mindmap.id, snapshot.mindmap)
  snapshot.nodes.forEach((node) => {
    state.draft.nodes.set(node.id, node)
    markNodeAdded(state, node.id)
  })
  state.draft.canvasOrder.set(insertCanvasSlot(state.draft.canvasOrder.current(), {
    kind: 'mindmap',
    id: snapshot.mindmap.id
  }, snapshot.slot))
  state.inverse.prepend({
    type: 'mindmap.delete',
    id: snapshot.mindmap.id
  })
  markMindmapAdded(state, snapshot.mindmap.id)
  markCanvasOrderTouched(state)
  enqueueMindmapLayout(state, snapshot.mindmap.id)
}

export const deleteMindmap = (
  state: WhiteboardReduceState,
  id: MindmapId
): void => {
  const mindmap = getMindmap(state.draft, id)
  const tree = getMindmapTree(state.draft, id)
  if (!mindmap || !tree) {
    return
  }

  const nodeIds = new Set(mindmapApi.tree.subtreeIds(tree, tree.rootNodeId))
  const connectedEdges = collectConnectedEdges(state.draft, nodeIds)
  connectedEdges.forEach((edge) => {
    state.inverse.prepend({
      type: 'edge.restore',
      edge: captureEdge(state, edge.id),
      slot: captureCanvasSlot(state, {
        kind: 'edge',
        id: edge.id
      })
    })
    state.draft.edges.delete(edge.id)
    state.draft.canvasOrder.set(removeCanvasRef(state.draft.canvasOrder.current(), {
      kind: 'edge',
      id: edge.id
    }))
    markEdgeRemoved(state, edge.id)
  })
  state.inverse.prepend({
    type: 'mindmap.restore',
    snapshot: captureMindmapSnapshot(state, id)
  })
  nodeIds.forEach((nodeId) => {
    removeMindmapNode(state, nodeId)
  })
  state.draft.mindmaps.delete(id)
  state.draft.canvasOrder.set(removeCanvasRef(state.draft.canvasOrder.current(), {
    kind: 'mindmap',
    id
  }))
  markMindmapRemoved(state, id)
  markCanvasOrderTouched(state)
}

export const moveMindmapRoot = (
  state: WhiteboardReduceState,
  id: MindmapId,
  position: Point
): void => {
  const mindmap = getMindmap(state.draft, id)
  const root = mindmap
    ? getNode(state.draft, mindmap.root)
    : undefined
  if (!mindmap || !root) {
    throw new Error(`Mindmap ${id} not found.`)
  }

  state.inverse.prepend({
    type: 'mindmap.move',
    id,
    position: clonePoint(root.position)!
  })
  state.draft.nodes.set(root.id, {
    ...root,
    position: clonePoint(position)!
  })
  markNodeUpdated(state, root.id)
  enqueueMindmapLayout(state, id)
}

export const patchMindmapLayout = (
  state: WhiteboardReduceState,
  id: MindmapId,
  patch: Partial<MindmapLayoutSpec>
): void => {
  const current = getMindmap(state.draft, id)
  if (!current) {
    throw new Error(`Mindmap ${id} not found.`)
  }

  state.inverse.prepend({
    type: 'mindmap.layout',
    id,
    patch: cloneLayoutPatch(current.layout)!
  })
  state.draft.mindmaps.set(id, {
    ...current,
    layout: {
      ...current.layout,
      ...patch
    }
  })
  markMindmapUpdated(state, id)
  enqueueMindmapLayout(state, id)
}

export const insertMindmapTopic = (
  state: WhiteboardReduceState,
  input: {
    id: MindmapId
    topic: Node
    value: MindmapTopicInsertInput
  }
): void => {
  const current = getMindmap(state.draft, input.id)
  if (!current) {
    throw new Error(`Mindmap ${input.id} not found.`)
  }

  const value = input.value
  let parentId: NodeId
  let index: number | undefined
  let side: 'left' | 'right' | undefined

  if (value.kind === 'child') {
    parentId = value.parentId
    index = value.options?.index
    side = value.options?.side
  } else if (value.kind === 'sibling') {
    const target = current.members[value.nodeId]
    parentId = target?.parentId ?? current.root
    const siblings = current.children[parentId] ?? []
    const currentIndex = siblings.indexOf(value.nodeId)
    index = currentIndex < 0
      ? undefined
      : value.position === 'before'
        ? currentIndex
        : currentIndex + 1
    side = target?.side
  } else {
    const target = current.members[value.nodeId]
    parentId = target?.parentId ?? current.root
    side = target?.side ?? value.options?.side
    const siblings = current.children[parentId] ?? []
    const currentIndex = siblings.indexOf(value.nodeId)
    const nextId = input.topic.id
    const nextParentChildren = currentIndex < 0
      ? [...siblings, nextId]
      : [...siblings.slice(0, currentIndex), nextId, ...siblings.slice(currentIndex + 1)]

    const nextMembers: MindmapRecord['members'] = {
      ...current.members,
      [nextId]: {
        parentId,
        side: parentId === current.root
          ? side
          : undefined,
        branchStyle: cloneBranchStyle(target?.branchStyle ?? current.members[parentId]?.branchStyle)!
      },
      [value.nodeId]: {
        ...current.members[value.nodeId],
        parentId: nextId,
        side: undefined
      }
    }

    state.draft.mindmaps.set(input.id, {
      ...current,
      members: nextMembers,
      children: {
        ...current.children,
        [parentId]: nextParentChildren,
        [nextId]: [value.nodeId]
      }
    })
    state.draft.nodes.set(nextId, input.topic)
    state.inverse.prepend({
      type: 'mindmap.topic.delete',
      id: input.id,
      input: {
        nodeId: nextId
      }
    })
    markNodeAdded(state, nextId)
    markMindmapUpdated(state, input.id)
    enqueueMindmapLayout(state, input.id)
    return
  }

  const siblings = current.children[parentId] ?? []
  const nextMembers: MindmapRecord['members'] = {
    ...current.members,
    [input.topic.id]: {
      parentId,
      side: parentId === current.root
        ? side ?? 'right'
        : undefined,
      branchStyle: cloneBranchStyle(current.members[parentId]?.branchStyle ?? current.members[current.root]?.branchStyle)!
    }
  }
  const nextChildren = {
    ...current.children,
    [parentId]: [...siblings],
    [input.topic.id]: []
  }
  if (index === undefined || index < 0 || index > siblings.length) {
    nextChildren[parentId].push(input.topic.id)
  } else {
    nextChildren[parentId].splice(index, 0, input.topic.id)
  }
  state.draft.mindmaps.set(input.id, {
    ...current,
    members: nextMembers,
    children: nextChildren
  })
  state.draft.nodes.set(input.topic.id, input.topic)
  state.inverse.prepend({
    type: 'mindmap.topic.delete',
    id: input.id,
    input: {
      nodeId: input.topic.id
    }
  })
  markNodeAdded(state, input.topic.id)
  markMindmapUpdated(state, input.id)
  enqueueMindmapLayout(state, input.id)
}

export const restoreMindmapTopic = (
  state: WhiteboardReduceState,
  input: {
    id: MindmapId
    snapshot: MindmapTopicSnapshot
  }
): void => {
  const current = getMindmap(state.draft, input.id)
  if (!current) {
    throw new Error(`Mindmap ${input.id} not found.`)
  }

  const nextMembers: MindmapRecord['members'] = {
    ...current.members,
    ...(Object.fromEntries(
      Object.entries(input.snapshot.members).map(([nodeId, member]) => [
        nodeId,
        cloneMindmapMember(member)!
      ])
    ) as MindmapRecord['members'])
  }
  const nextChildren = { ...current.children }
  Object.entries(input.snapshot.children).forEach(([nodeId, children]) => {
    nextChildren[nodeId] = [...children]
  })
  const siblings = [...(nextChildren[input.snapshot.slot.parent] ?? [])]
  if (input.snapshot.slot.prev) {
    const index = siblings.indexOf(input.snapshot.slot.prev)
    if (index >= 0) {
      siblings.splice(index + 1, 0, input.snapshot.root)
    } else {
      siblings.push(input.snapshot.root)
    }
  } else if (input.snapshot.slot.next) {
    const index = siblings.indexOf(input.snapshot.slot.next)
    if (index >= 0) {
      siblings.splice(index, 0, input.snapshot.root)
    } else {
      siblings.unshift(input.snapshot.root)
    }
  } else {
    siblings.push(input.snapshot.root)
  }
  nextChildren[input.snapshot.slot.parent] = siblings
  state.draft.mindmaps.set(input.id, {
    ...current,
    members: nextMembers,
    children: nextChildren
  })
  input.snapshot.nodes.forEach((node) => {
    state.draft.nodes.set(node.id, node)
    markNodeAdded(state, node.id)
  })
  state.inverse.prepend({
    type: 'mindmap.topic.delete',
    id: input.id,
    input: {
      nodeId: input.snapshot.root
    }
  })
  markMindmapUpdated(state, input.id)
  enqueueMindmapLayout(state, input.id)
}

export const moveMindmapTopic = (
  state: WhiteboardReduceState,
  input: {
    id: MindmapId
    value: MindmapTopicMoveInput
  }
): void => {
  const current = getMindmap(state.draft, input.id)
  if (!current) {
    throw new Error(`Mindmap ${input.id} not found.`)
  }

  const member = current.members[input.value.nodeId]
  if (!member?.parentId) {
    throw new Error(`Topic ${input.value.nodeId} cannot move.`)
  }

  const prevParentId = member.parentId
  const prevSiblings = [...(current.children[prevParentId] ?? [])]
  const prevIndex = prevSiblings.indexOf(input.value.nodeId)
  const nextParentId = input.value.parentId
  const nextSiblings = prevParentId === nextParentId
    ? prevSiblings.filter((id) => id !== input.value.nodeId)
    : [...(current.children[nextParentId] ?? [])]
  if (
    input.value.index === undefined
    || input.value.index < 0
    || input.value.index > nextSiblings.length
  ) {
    nextSiblings.push(input.value.nodeId)
  } else {
    nextSiblings.splice(input.value.index, 0, input.value.nodeId)
  }

  const nextMembers: MindmapRecord['members'] = {
    ...current.members,
    [input.value.nodeId]: {
      ...member,
      parentId: nextParentId,
      side: nextParentId === current.root
        ? (input.value.side ?? member.side)
        : undefined
    }
  }

  state.draft.mindmaps.set(input.id, {
    ...current,
    members: nextMembers,
    children: {
      ...current.children,
      [prevParentId]: prevSiblings.filter((id) => id !== input.value.nodeId),
      [nextParentId]: nextSiblings
    }
  })
  state.inverse.prepend({
    type: 'mindmap.topic.move',
    id: input.id,
    input: {
      nodeId: input.value.nodeId,
      parentId: prevParentId,
      index: prevIndex < 0
        ? undefined
        : prevIndex,
      side: member.side
    }
  })
  markMindmapUpdated(state, input.id)
  enqueueMindmapLayout(state, input.id)
}

export const deleteMindmapTopic = (
  state: WhiteboardReduceState,
  input: {
    id: MindmapId
    nodeId: NodeId
  }
): void => {
  const current = getMindmap(state.draft, input.id)
  const tree = getMindmapTree(state.draft, input.id)
  if (!current || !tree) {
    throw new Error(`Mindmap ${input.id} not found.`)
  }
  if (input.nodeId === current.root) {
    throw new Error('Root topic cannot use mindmap.topic.delete.')
  }

  const rootMember = current.members[input.nodeId]
  const parentId = rootMember?.parentId
  if (!parentId) {
    throw new Error(`Topic ${input.nodeId} parent missing.`)
  }

  const siblings = current.children[parentId] ?? []
  const nodeIds = new Set(mindmapApi.tree.subtreeIds(tree, input.nodeId))
  const connectedEdges = collectConnectedEdges(state.draft, nodeIds)
  connectedEdges.forEach((edge) => {
    state.inverse.prepend({
      type: 'edge.restore',
      edge: captureEdge(state, edge.id),
      slot: captureCanvasSlot(state, {
        kind: 'edge',
        id: edge.id
      })
    })
    state.draft.edges.delete(edge.id)
    state.draft.canvasOrder.set(removeCanvasRef(state.draft.canvasOrder.current(), {
      kind: 'edge',
      id: edge.id
    }))
    markEdgeRemoved(state, edge.id)
  })
  state.inverse.prepend({
    type: 'mindmap.topic.restore',
    id: input.id,
    snapshot: captureMindmapTopicSnapshot(state, input.id, input.nodeId)
  })
  const nextMembers: MindmapRecord['members'] = { ...current.members }
  const nextChildren = { ...current.children }
  nextChildren[parentId] = siblings.filter((nodeId) => nodeId !== input.nodeId)
  nodeIds.forEach((nodeId) => {
    delete nextMembers[nodeId]
    delete nextChildren[nodeId]
    removeMindmapNode(state, nodeId)
  })
  state.draft.mindmaps.set(input.id, {
    ...current,
    members: nextMembers,
    children: nextChildren
  })
  markMindmapUpdated(state, input.id)
  if (connectedEdges.length > 0) {
    markCanvasOrderTouched(state)
  }
  enqueueMindmapLayout(state, input.id)
}

export const patchMindmapTopic = (
  state: WhiteboardReduceState,
  id: MindmapId,
  topicId: NodeId,
  input: {
    fields?: MindmapTopicFieldPatch
    record?: RecordWrite
  }
): void => {
  const current = getNode(state.draft, topicId)
  if (!current) {
    throw new Error(`Topic ${topicId} not found.`)
  }

  const inverseFields = input.fields
    ? (() => {
        const result: MindmapTopicFieldPatch = {}
        if (hasOwn(input.fields, 'size')) {
          result.size = json.clone(current.size)
        }
        if (hasOwn(input.fields, 'rotation')) {
          result.rotation = json.clone(current.rotation)
        }
        if (hasOwn(input.fields, 'locked')) {
          result.locked = json.clone(current.locked)
        }
        return result
      })()
    : undefined
  const inverseRecord = input.record
    ? draftRecord.inverse(current, input.record)
    : undefined
  const fieldPatched = applyTopicFieldPatch(current, input.fields)
  const next = input.record
    ? draftRecord.apply(fieldPatched, input.record)
    : fieldPatched

  state.inverse.prepend({
    type: 'mindmap.topic.patch',
    id,
    topicId,
    ...(inverseFields && Object.keys(inverseFields).length
      ? { fields: inverseFields }
      : {}),
    ...(inverseRecord && Object.keys(inverseRecord).length
      ? { record: inverseRecord }
      : {})
  })
  state.draft.nodes.set(topicId, next)
  markNodeUpdated(state, topicId)
  enqueueMindmapLayout(state, id)
}

export const patchMindmapBranch = (
  state: WhiteboardReduceState,
  id: MindmapId,
  topicId: NodeId,
  fields?: MindmapBranchFieldPatch
): void => {
  const current = getMindmap(state.draft, id)
  if (!current) {
    throw new Error(`Mindmap ${id} not found.`)
  }

  const member = current.members[topicId]
  if (!member) {
    throw new Error(`Topic ${topicId} not found.`)
  }

  if (!fields) {
    return
  }

  const inverse: MindmapBranchFieldPatch = {}
  let nextBranchStyle = {
    ...member.branchStyle
  }
  if (hasOwn(fields, 'color')) {
    inverse.color = json.clone(member.branchStyle.color)
    const color = fields.color
    if (color === undefined) {
      return
    }
    nextBranchStyle = {
      ...nextBranchStyle,
      color: json.clone(color)
    }
  }
  if (hasOwn(fields, 'line')) {
    inverse.line = json.clone(member.branchStyle.line)
    const line = fields.line
    if (line === undefined) {
      return
    }
    nextBranchStyle = {
      ...nextBranchStyle,
      line: json.clone(line)
    }
  }
  if (hasOwn(fields, 'width')) {
    inverse.width = json.clone(member.branchStyle.width)
    const width = fields.width
    if (width === undefined) {
      return
    }
    nextBranchStyle = {
      ...nextBranchStyle,
      width: json.clone(width)
    }
  }
  if (hasOwn(fields, 'stroke')) {
    inverse.stroke = json.clone(member.branchStyle.stroke)
    const stroke = fields.stroke
    if (stroke === undefined) {
      return
    }
    nextBranchStyle = {
      ...nextBranchStyle,
      stroke: json.clone(stroke)
    }
  }

  state.inverse.prepend({
    type: 'mindmap.branch.patch',
    id,
    topicId,
    fields: inverse
  })
  state.draft.mindmaps.set(id, {
    ...current,
    members: {
      ...current.members,
      [topicId]: {
        ...member,
        branchStyle: nextBranchStyle
      }
    }
  })
  markMindmapUpdated(state, id)
  enqueueMindmapLayout(state, id)
}

export const setMindmapTopicCollapsed = (
  state: WhiteboardReduceState,
  id: MindmapId,
  topicId: NodeId,
  collapsed?: boolean
): void => {
  const current = getMindmap(state.draft, id)
  if (!current) {
    throw new Error(`Mindmap ${id} not found.`)
  }

  const member = current.members[topicId]
  if (!member) {
    throw new Error(`Topic ${topicId} not found.`)
  }

  state.inverse.prepend({
    type: 'mindmap.topic.collapse',
    id,
    topicId,
    collapsed: member.collapsed
  })
  state.draft.mindmaps.set(id, {
    ...current,
    members: {
      ...current.members,
      [topicId]: {
        ...member,
        collapsed: collapsed ?? !member.collapsed
      }
    }
  })
  markMindmapUpdated(state, id)
  enqueueMindmapLayout(state, id)
}
