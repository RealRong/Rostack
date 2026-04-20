import { getSubtreeIds } from '@whiteboard/core/mindmap'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { cloneBranchStyle, cloneMindmapMember } from '@whiteboard/core/kernel/reduce/copy'
import { markChange } from '@whiteboard/core/kernel/reduce/commit'
import {
  collectConnectedEdges,
  deleteEdge,
  getMindmap,
  getMindmapTreeFromDraft
} from '@whiteboard/core/kernel/reduce/runtime'

export const createMindmapTopicStructureApi = (
  tx: ReducerTx
) => ({
  insert: (input: {
    id: import('@whiteboard/core/types').MindmapId
    topic: import('@whiteboard/core/types').Node
    value: import('@whiteboard/core/types').MindmapTopicInsertInput
  }) => {
    const current = getMindmap(tx._runtime.draft, input.id)
    if (!current) {
      throw new Error(`Mindmap ${input.id} not found.`)
    }
    const value = input.value
    let parentId: import('@whiteboard/core/types').NodeId
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
      tx._runtime.draft.mindmaps.set(input.id, {
        ...current,
        members: {
          ...current.members,
          [nextId]: {
            parentId,
            side: parentId === current.root ? side : undefined,
            branchStyle: cloneBranchStyle(target?.branchStyle ?? current.members[parentId]?.branchStyle)!
          },
          [value.nodeId]: {
            ...current.members[value.nodeId],
            parentId: nextId,
            side: undefined
          }
        },
        children: {
          ...current.children,
          [parentId]: currentIndex < 0
            ? siblings
            : [...siblings.slice(0, currentIndex), nextId, ...siblings.slice(currentIndex + 1)],
          [nextId]: [value.nodeId]
        }
      })
      tx._runtime.draft.nodes.set(nextId, input.topic)
      tx._runtime.inverse.unshift({
        type: 'mindmap.topic.delete',
        id: input.id,
        input: { nodeId: nextId }
      })
      markChange(tx._runtime.changes.nodes, 'add', nextId)
      markChange(tx._runtime.changes.mindmaps, 'update', input.id)
      tx.dirty.node.value(nextId)
      tx.dirty.mindmap.layout(input.id)
      return
    }

    const siblings = current.children[parentId] ?? []
    const nextMembers = {
      ...current.members,
      [input.topic.id]: {
        parentId,
        side: parentId === current.root ? side ?? 'right' : undefined,
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
    tx._runtime.draft.mindmaps.set(input.id, {
      ...current,
      members: nextMembers,
      children: nextChildren
    })
    tx._runtime.draft.nodes.set(input.topic.id, input.topic)
    tx._runtime.inverse.unshift({
      type: 'mindmap.topic.delete',
      id: input.id,
      input: { nodeId: input.topic.id }
    })
    markChange(tx._runtime.changes.nodes, 'add', input.topic.id)
    markChange(tx._runtime.changes.mindmaps, 'update', input.id)
    tx.dirty.node.value(input.topic.id)
    tx.dirty.mindmap.layout(input.id)
  },
  restore: (input: {
    id: import('@whiteboard/core/types').MindmapId
    snapshot: import('@whiteboard/core/types').MindmapTopicSnapshot
  }) => {
    const current = getMindmap(tx._runtime.draft, input.id)
    if (!current) {
      throw new Error(`Mindmap ${input.id} not found.`)
    }
    const nextMembers = {
      ...current.members,
      ...Object.fromEntries(
        Object.entries(input.snapshot.members).map(([nodeId, member]) => [
          nodeId,
          cloneMindmapMember(member)!
        ])
      )
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
    tx._runtime.draft.mindmaps.set(input.id, {
      ...current,
      members: nextMembers,
      children: nextChildren
    })
    input.snapshot.nodes.forEach((node) => {
      tx._runtime.draft.nodes.set(node.id, node)
      markChange(tx._runtime.changes.nodes, 'add', node.id)
      tx.dirty.node.value(node.id)
    })
    tx._runtime.inverse.unshift({
      type: 'mindmap.topic.delete',
      id: input.id,
      input: { nodeId: input.snapshot.root }
    })
    markChange(tx._runtime.changes.mindmaps, 'update', input.id)
    tx.dirty.mindmap.layout(input.id)
  },
  move: (input: {
    id: import('@whiteboard/core/types').MindmapId
    value: import('@whiteboard/core/types').MindmapTopicMoveInput
  }) => {
    const current = getMindmap(tx._runtime.draft, input.id)
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
    tx._runtime.draft.mindmaps.set(input.id, {
      ...current,
      members: {
        ...current.members,
        [input.value.nodeId]: {
          ...member,
          parentId: nextParentId,
          side: nextParentId === current.root
            ? (input.value.side ?? member.side)
            : undefined
        }
      },
      children: {
        ...current.children,
        [prevParentId]: prevSiblings.filter((id) => id !== input.value.nodeId),
        [nextParentId]: nextSiblings
      }
    })
    tx._runtime.inverse.unshift({
      type: 'mindmap.topic.move',
      id: input.id,
      input: {
        nodeId: input.value.nodeId,
        parentId: prevParentId,
        index: prevIndex < 0 ? undefined : prevIndex,
        side: member.side
      }
    })
    markChange(tx._runtime.changes.mindmaps, 'update', input.id)
    tx.dirty.mindmap.layout(input.id)
  },
  delete: (input: {
    id: import('@whiteboard/core/types').MindmapId
    nodeId: import('@whiteboard/core/types').NodeId
  }) => {
    const current = getMindmap(tx._runtime.draft, input.id)
    const tree = getMindmapTreeFromDraft(tx._runtime.draft, input.id)
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
    const index = siblings.indexOf(input.nodeId)
    const nodeIds = new Set(mindmapApi.tree.subtreeIds(tree, input.nodeId))
    const connectedEdges = collectConnectedEdges(tx._runtime.draft, nodeIds)
    connectedEdges.forEach((edge) => {
      tx._runtime.inverse.unshift({
        type: 'edge.restore',
        edge: tx.snapshot.edge.capture(edge.id),
        slot: tx.snapshot.canvas.slot({
          kind: 'edge',
          id: edge.id
        })
      })
      deleteEdge(tx._runtime.draft, edge.id)
      markChange(tx._runtime.changes.edges, 'delete', edge.id)
      tx.dirty.edge.value(edge.id)
    })
    tx._runtime.inverse.unshift({
      type: 'mindmap.topic.restore',
      id: input.id,
      snapshot: tx.snapshot.mindmap.topic(input.id, input.nodeId)
    })
    const nextMembers = { ...current.members }
    const nextChildren = { ...current.children }
    nextChildren[parentId] = siblings.filter((nodeId) => nodeId !== input.nodeId)
    nodeIds.forEach((nodeId) => {
      delete nextMembers[nodeId]
      delete nextChildren[nodeId]
      tx._runtime.draft.nodes.delete(nodeId)
      markChange(tx._runtime.changes.nodes, 'delete', nodeId)
      tx.dirty.node.value(nodeId)
    })
    tx._runtime.draft.mindmaps.set(input.id, {
      ...current,
      members: nextMembers,
      children: nextChildren
    })
    markChange(tx._runtime.changes.mindmaps, 'update', input.id)
    tx.dirty.mindmap.layout(input.id)
  }
})
