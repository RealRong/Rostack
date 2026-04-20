import { getSubtreeIds } from '@whiteboard/core/mindmap'
import { err } from '@whiteboard/core/result'
import type {
  KernelReduceResult,
  NodeId,
  Operation
} from '@whiteboard/core/types'
import {
  applyMindmapTopicFieldSet,
  applyMindmapTopicFieldUnset,
  applyMindmapTopicRecordOperation,
  readRecordPathValue
} from '@whiteboard/core/kernel/reduce/apply'
import {
  cloneBranchStyle,
  cloneCanvasSlot,
  cloneEdge,
  cloneLayoutPatch,
  cloneMindmap,
  cloneMindmapMember,
  cloneNode,
  clonePoint
} from '@whiteboard/core/kernel/reduce/clone'
import {
  collectConnectedEdges,
  deleteEdge,
  deleteNode,
  getMindmap,
  getMindmapTreeFromDraft,
  getNode,
  insertCanvasSlot,
  readCanvasOrder,
  readCanvasSlot,
  setNode,
  writeCanvasOrder
} from '@whiteboard/core/kernel/reduce/draft'
import { markChange } from '@whiteboard/core/kernel/reduce/state'
import type { ReduceRuntime } from '@whiteboard/core/kernel/reduce/runtime'
import { cloneValue } from '@whiteboard/core/value'

type MindmapOperation = Extract<
  Operation,
  {
    type:
      | 'mindmap.create'
      | 'mindmap.restore'
      | 'mindmap.delete'
      | 'mindmap.root.move'
      | 'mindmap.layout'
      | 'mindmap.topic.insert'
      | 'mindmap.topic.restore'
      | 'mindmap.topic.move'
      | 'mindmap.topic.delete'
      | 'mindmap.topic.field.set'
      | 'mindmap.topic.field.unset'
      | 'mindmap.topic.record.set'
      | 'mindmap.topic.record.unset'
      | 'mindmap.branch.field.set'
      | 'mindmap.branch.field.unset'
      | 'mindmap.topic.collapse'
  }
>

export const handleMindmapOperation = (
  runtime: ReduceRuntime,
  operation: MindmapOperation
): KernelReduceResult | undefined => {
  switch (operation.type) {
    case 'mindmap.create': {
      runtime.draft.mindmaps.set(operation.mindmap.id, operation.mindmap)
      markChange(runtime.changes.mindmaps, 'add', operation.mindmap.id)
      runtime.inverse.unshift({
        type: 'mindmap.delete',
        id: operation.mindmap.id
      })
      operation.nodes.forEach((node) => {
        setNode(runtime.draft, node)
        markChange(runtime.changes.nodes, 'add', node.id)
      })
      runtime.changes.canvasOrder = true
      runtime.queueMindmapLayout(operation.mindmap.id)
      return
    }
    case 'mindmap.restore': {
      runtime.draft.mindmaps.set(operation.snapshot.mindmap.id, operation.snapshot.mindmap)
      operation.snapshot.nodes.forEach((node) => {
        runtime.draft.nodes.set(node.id, node)
      })
      const rootId = operation.snapshot.mindmap.root
      writeCanvasOrder(runtime.draft, insertCanvasSlot(readCanvasOrder(runtime.draft), {
        kind: 'node',
        id: rootId
      }, operation.snapshot.slot))
      runtime.inverse.unshift({
        type: 'mindmap.delete',
        id: operation.snapshot.mindmap.id
      })
      markChange(runtime.changes.mindmaps, 'add', operation.snapshot.mindmap.id)
      operation.snapshot.nodes.forEach((node) => markChange(runtime.changes.nodes, 'add', node.id))
      runtime.changes.canvasOrder = true
      runtime.queueMindmapLayout(operation.snapshot.mindmap.id)
      return
    }
    case 'mindmap.delete': {
      const mindmap = getMindmap(runtime.draft, operation.id)
      const tree = getMindmapTreeFromDraft(runtime.draft, operation.id)
      if (!mindmap || !tree) {
        return
      }
      const nodeIds = new Set(getSubtreeIds(tree, tree.rootNodeId))
      const nodes = [...nodeIds].map((nodeId) => cloneNode(getNode(runtime.draft, nodeId)!)).filter(Boolean)
      const slot = readCanvasSlot(readCanvasOrder(runtime.draft), {
        kind: 'node',
        id: mindmap.root
      })
      const connectedEdges = collectConnectedEdges(runtime.draft, nodeIds)
      connectedEdges.forEach((edge) => {
        runtime.inverse.unshift({
          type: 'edge.restore',
          edge: cloneEdge(edge),
          slot: cloneCanvasSlot(readCanvasSlot(readCanvasOrder(runtime.draft), {
            kind: 'edge',
            id: edge.id
          }))
        })
        deleteEdge(runtime.draft, edge.id)
        markChange(runtime.changes.edges, 'delete', edge.id)
      })
      runtime.inverse.unshift({
        type: 'mindmap.restore',
        snapshot: {
          mindmap: cloneMindmap(mindmap),
          nodes,
          slot: cloneCanvasSlot(slot)
        }
      })
      nodeIds.forEach((nodeId) => {
        deleteNode(runtime.draft, nodeId)
        markChange(runtime.changes.nodes, 'delete', nodeId)
      })
      runtime.draft.mindmaps.delete(operation.id)
      markChange(runtime.changes.mindmaps, 'delete', operation.id)
      runtime.changes.canvasOrder = true
      return
    }
    case 'mindmap.root.move': {
      const mindmap = getMindmap(runtime.draft, operation.id)
      const root = mindmap ? getNode(runtime.draft, mindmap.root) : undefined
      if (!mindmap || !root) {
        return err('invalid', `Mindmap ${operation.id} not found.`)
      }
      runtime.inverse.unshift({
        type: 'mindmap.root.move',
        id: operation.id,
        position: clonePoint(root.position)!
      })
      runtime.draft.nodes.set(root.id, {
        ...root,
        position: clonePoint(operation.position)!
      })
      markChange(runtime.changes.nodes, 'update', root.id)
      runtime.queueMindmapLayout(operation.id)
      return
    }
    case 'mindmap.layout': {
      const current = getMindmap(runtime.draft, operation.id)
      if (!current) {
        return err('invalid', `Mindmap ${operation.id} not found.`)
      }
      runtime.inverse.unshift({
        type: 'mindmap.layout',
        id: operation.id,
        patch: cloneLayoutPatch(current.layout)!
      })
      runtime.draft.mindmaps.set(operation.id, {
        ...current,
        layout: {
          ...current.layout,
          ...operation.patch
        }
      })
      markChange(runtime.changes.mindmaps, 'update', operation.id)
      runtime.queueMindmapLayout(operation.id)
      return
    }
    case 'mindmap.topic.insert': {
      const current = getMindmap(runtime.draft, operation.id)
      if (!current) {
        return err('invalid', `Mindmap ${operation.id} not found.`)
      }
      const tree = getMindmapTreeFromDraft(runtime.draft, operation.id)
      if (!tree) {
        return err('invalid', `Mindmap ${operation.id} tree missing.`)
      }
      const input = operation.input
      let parentId: NodeId
      let index: number | undefined
      let side: 'left' | 'right' | undefined
      if (input.kind === 'child') {
        parentId = input.parentId
        index = input.options?.index
        side = input.options?.side
      } else if (input.kind === 'sibling') {
        const target = current.members[input.nodeId]
        parentId = target?.parentId ?? current.root
        const siblings = current.children[parentId] ?? []
        const currentIndex = siblings.indexOf(input.nodeId)
        index = currentIndex < 0
          ? undefined
          : input.position === 'before'
            ? currentIndex
            : currentIndex + 1
        side = target?.side
      } else {
        const target = current.members[input.nodeId]
        parentId = target?.parentId ?? current.root
        side = target?.side ?? input.options?.side
        const siblings = current.children[parentId] ?? []
        const currentIndex = siblings.indexOf(input.nodeId)
        const nextId = operation.node.id
        runtime.draft.mindmaps.set(operation.id, {
          ...current,
          members: {
            ...current.members,
            [nextId]: {
              parentId,
              side: parentId === current.root ? side : undefined,
              branchStyle: cloneBranchStyle(target?.branchStyle ?? current.members[parentId]?.branchStyle)!
            },
            [input.nodeId]: {
              ...current.members[input.nodeId],
              parentId: nextId,
              side: undefined
            }
          },
          children: {
            ...current.children,
            [parentId]: currentIndex < 0
              ? siblings
              : [...siblings.slice(0, currentIndex), nextId, ...siblings.slice(currentIndex + 1)],
            [nextId]: [input.nodeId]
          }
        })
        runtime.draft.nodes.set(nextId, operation.node)
        runtime.inverse.unshift({
          type: 'mindmap.topic.delete',
          id: operation.id,
          input: {
            nodeId: nextId
          }
        })
        markChange(runtime.changes.nodes, 'add', nextId)
        markChange(runtime.changes.mindmaps, 'update', operation.id)
        runtime.queueMindmapLayout(operation.id)
        return
      }
      const siblings = current.children[parentId] ?? []
      const nextMembers = {
        ...current.members,
        [operation.node.id]: {
          parentId,
          side: parentId === current.root ? side ?? 'right' : undefined,
          branchStyle: cloneBranchStyle(current.members[parentId]?.branchStyle ?? current.members[current.root]?.branchStyle)!
        }
      }
      const nextChildren = {
        ...current.children,
        [parentId]: [...siblings],
        [operation.node.id]: []
      }
      if (index === undefined || index < 0 || index > siblings.length) {
        nextChildren[parentId].push(operation.node.id)
      } else {
        nextChildren[parentId].splice(index, 0, operation.node.id)
      }
      runtime.draft.mindmaps.set(operation.id, {
        ...current,
        members: nextMembers,
        children: nextChildren
      })
      runtime.draft.nodes.set(operation.node.id, operation.node)
      runtime.inverse.unshift({
        type: 'mindmap.topic.delete',
        id: operation.id,
        input: {
          nodeId: operation.node.id
        }
      })
      markChange(runtime.changes.nodes, 'add', operation.node.id)
      markChange(runtime.changes.mindmaps, 'update', operation.id)
      runtime.queueMindmapLayout(operation.id)
      return
    }
    case 'mindmap.topic.restore': {
      const current = getMindmap(runtime.draft, operation.id)
      if (!current) {
        return err('invalid', `Mindmap ${operation.id} not found.`)
      }
      const nextMembers = {
        ...current.members,
        ...Object.fromEntries(
          Object.entries(operation.snapshot.members).map(([nodeId, member]) => [
            nodeId,
            {
              parentId: member.parentId,
              side: member.side,
              collapsed: member.collapsed,
              branchStyle: cloneBranchStyle(member.branchStyle)!
            }
          ])
        )
      }
      const nextChildren = { ...current.children }
      Object.entries(operation.snapshot.children).forEach(([nodeId, children]) => {
        nextChildren[nodeId] = [...children]
      })
      const siblings = [...(nextChildren[operation.snapshot.slot.parent] ?? [])]
      if (operation.snapshot.slot.prev) {
        const index = siblings.indexOf(operation.snapshot.slot.prev)
        if (index >= 0) {
          siblings.splice(index + 1, 0, operation.snapshot.root)
        } else {
          siblings.push(operation.snapshot.root)
        }
      } else if (operation.snapshot.slot.next) {
        const index = siblings.indexOf(operation.snapshot.slot.next)
        if (index >= 0) {
          siblings.splice(index, 0, operation.snapshot.root)
        } else {
          siblings.unshift(operation.snapshot.root)
        }
      } else {
        siblings.push(operation.snapshot.root)
      }
      nextChildren[operation.snapshot.slot.parent] = siblings
      runtime.draft.mindmaps.set(operation.id, {
        ...current,
        members: nextMembers,
        children: nextChildren
      })
      operation.snapshot.nodes.forEach((node) => {
        runtime.draft.nodes.set(node.id, node)
        markChange(runtime.changes.nodes, 'add', node.id)
      })
      runtime.inverse.unshift({
        type: 'mindmap.topic.delete',
        id: operation.id,
        input: {
          nodeId: operation.snapshot.root
        }
      })
      markChange(runtime.changes.mindmaps, 'update', operation.id)
      runtime.queueMindmapLayout(operation.id)
      return
    }
    case 'mindmap.topic.move': {
      const current = getMindmap(runtime.draft, operation.id)
      if (!current) {
        return err('invalid', `Mindmap ${operation.id} not found.`)
      }
      const member = current.members[operation.input.nodeId]
      if (!member?.parentId) {
        return err('invalid', `Topic ${operation.input.nodeId} cannot move.`)
      }
      const prevParentId = member.parentId
      const prevSiblings = [...(current.children[prevParentId] ?? [])]
      const prevIndex = prevSiblings.indexOf(operation.input.nodeId)
      const nextParentId = operation.input.parentId
      const nextSiblings = prevParentId === nextParentId
        ? prevSiblings.filter((id) => id !== operation.input.nodeId)
        : [...(current.children[nextParentId] ?? [])]
      if (
        operation.input.index === undefined
        || operation.input.index < 0
        || operation.input.index > nextSiblings.length
      ) {
        nextSiblings.push(operation.input.nodeId)
      } else {
        nextSiblings.splice(operation.input.index, 0, operation.input.nodeId)
      }
      runtime.draft.mindmaps.set(operation.id, {
        ...current,
        members: {
          ...current.members,
          [operation.input.nodeId]: {
            ...member,
            parentId: nextParentId,
            side: nextParentId === current.root
              ? (operation.input.side ?? member.side)
              : undefined
          }
        },
        children: {
          ...current.children,
          [prevParentId]: prevSiblings.filter((id) => id !== operation.input.nodeId),
          [nextParentId]: nextSiblings
        }
      })
      runtime.inverse.unshift({
        type: 'mindmap.topic.move',
        id: operation.id,
        input: {
          nodeId: operation.input.nodeId,
          parentId: prevParentId,
          index: prevIndex < 0 ? undefined : prevIndex,
          side: member.side
        }
      })
      markChange(runtime.changes.mindmaps, 'update', operation.id)
      runtime.queueMindmapLayout(operation.id)
      return
    }
    case 'mindmap.topic.delete': {
      const current = getMindmap(runtime.draft, operation.id)
      const tree = getMindmapTreeFromDraft(runtime.draft, operation.id)
      if (!current || !tree) {
        return err('invalid', `Mindmap ${operation.id} not found.`)
      }
      const rootId = operation.input.nodeId
      if (rootId === current.root) {
        return err('invalid', 'Root topic cannot use mindmap.topic.delete.')
      }
      const rootMember = current.members[rootId]
      const parentId = rootMember?.parentId
      if (!parentId) {
        return err('invalid', `Topic ${rootId} parent missing.`)
      }
      const siblings = current.children[parentId] ?? []
      const index = siblings.indexOf(rootId)
      const nodeIds = new Set(getSubtreeIds(tree, rootId))
      const nodes = [...nodeIds].map((nodeId) => cloneNode(getNode(runtime.draft, nodeId)!)).filter(Boolean)
      const members = Object.fromEntries(
        [...nodeIds].map((nodeId) => [nodeId, cloneMindmapMember(current.members[nodeId])!])
      )
      const children = Object.fromEntries(
        [...nodeIds].map((nodeId) => [nodeId, [...(current.children[nodeId] ?? [])]])
      )
      const connectedEdges = collectConnectedEdges(runtime.draft, nodeIds)
      connectedEdges.forEach((edge) => {
        runtime.inverse.unshift({
          type: 'edge.restore',
          edge: cloneEdge(edge),
          slot: cloneCanvasSlot(readCanvasSlot(readCanvasOrder(runtime.draft), {
            kind: 'edge',
            id: edge.id
          }))
        })
        deleteEdge(runtime.draft, edge.id)
        markChange(runtime.changes.edges, 'delete', edge.id)
      })
      runtime.inverse.unshift({
        type: 'mindmap.topic.restore',
        id: operation.id,
        snapshot: {
          root: rootId,
          slot: {
            parent: parentId,
            prev: index > 0 ? siblings[index - 1] : undefined,
            next: index >= 0 ? siblings[index + 1] : undefined
          },
          nodes,
          members,
          children
        }
      })
      const nextMembers = { ...current.members }
      const nextChildren = { ...current.children }
      nextChildren[parentId] = siblings.filter((nodeId) => nodeId !== rootId)
      nodeIds.forEach((nodeId) => {
        delete nextMembers[nodeId]
        delete nextChildren[nodeId]
        runtime.draft.nodes.delete(nodeId)
        markChange(runtime.changes.nodes, 'delete', nodeId)
      })
      runtime.draft.mindmaps.set(operation.id, {
        ...current,
        members: nextMembers,
        children: nextChildren
      })
      markChange(runtime.changes.mindmaps, 'update', operation.id)
      runtime.queueMindmapLayout(operation.id)
      return
    }
    case 'mindmap.topic.field.set': {
      const current = getNode(runtime.draft, operation.topicId)
      if (!current) {
        return err('invalid', `Topic ${operation.topicId} not found.`)
      }
      runtime.inverse.unshift(
        (current as Record<string, unknown>)[operation.field] === undefined && operation.field !== 'size'
          ? {
              type: 'mindmap.topic.field.unset',
              id: operation.id,
              topicId: operation.topicId,
              field: operation.field as Extract<Operation, { type: 'mindmap.topic.field.unset' }>['field']
            }
          : {
              type: 'mindmap.topic.field.set',
              id: operation.id,
              topicId: operation.topicId,
              field: operation.field,
              value: cloneValue((current as Record<string, unknown>)[operation.field])
            }
      )
      runtime.draft.nodes.set(operation.topicId, applyMindmapTopicFieldSet(current, operation))
      markChange(runtime.changes.nodes, 'update', operation.topicId)
      runtime.queueMindmapLayout(operation.id)
      return
    }
    case 'mindmap.topic.field.unset': {
      const current = getNode(runtime.draft, operation.topicId)
      if (!current) {
        return err('invalid', `Topic ${operation.topicId} not found.`)
      }
      runtime.inverse.unshift({
        type: 'mindmap.topic.field.set',
        id: operation.id,
        topicId: operation.topicId,
        field: operation.field,
        value: cloneValue((current as Record<string, unknown>)[operation.field])
      })
      runtime.draft.nodes.set(operation.topicId, applyMindmapTopicFieldUnset(current, operation))
      markChange(runtime.changes.nodes, 'update', operation.topicId)
      runtime.queueMindmapLayout(operation.id)
      return
    }
    case 'mindmap.topic.record.set':
    case 'mindmap.topic.record.unset': {
      const current = getNode(runtime.draft, operation.topicId)
      if (!current) {
        return err('invalid', `Topic ${operation.topicId} not found.`)
      }
      const currentRoot = operation.scope === 'data'
        ? current.data
        : current.style
      const previous = readRecordPathValue(currentRoot, operation.path)
      runtime.inverse.unshift(operation.type === 'mindmap.topic.record.set' && previous === undefined
        ? {
            type: 'mindmap.topic.record.unset',
            id: operation.id,
            topicId: operation.topicId,
            scope: operation.scope,
            path: operation.path
          }
        : {
            type: 'mindmap.topic.record.set',
            id: operation.id,
            topicId: operation.topicId,
            scope: operation.scope,
            path: operation.path,
            value: cloneValue(previous)
          })
      const next = applyMindmapTopicRecordOperation(current, operation)
      if (!next.ok) {
        return err('invalid', next.message)
      }
      runtime.draft.nodes.set(operation.topicId, next.node)
      markChange(runtime.changes.nodes, 'update', operation.topicId)
      runtime.queueMindmapLayout(operation.id)
      return
    }
    case 'mindmap.branch.field.set': {
      const current = getMindmap(runtime.draft, operation.id)
      if (!current) {
        return err('invalid', `Mindmap ${operation.id} not found.`)
      }
      const member = current.members[operation.topicId]
      if (!member) {
        return err('invalid', `Topic ${operation.topicId} not found.`)
      }
      runtime.inverse.unshift({
        type: 'mindmap.branch.field.set',
        id: operation.id,
        topicId: operation.topicId,
        field: operation.field,
        value: cloneValue(member.branchStyle[operation.field])
      })
      runtime.draft.mindmaps.set(operation.id, {
        ...current,
        members: {
          ...current.members,
          [operation.topicId]: {
            ...member,
            branchStyle: {
              ...member.branchStyle,
              [operation.field]: cloneValue(operation.value) as never
            }
          }
        }
      })
      markChange(runtime.changes.mindmaps, 'update', operation.id)
      runtime.queueMindmapLayout(operation.id)
      return
    }
    case 'mindmap.branch.field.unset': {
      const current = getMindmap(runtime.draft, operation.id)
      if (!current) {
        return err('invalid', `Mindmap ${operation.id} not found.`)
      }
      const member = current.members[operation.topicId]
      if (!member) {
        return err('invalid', `Topic ${operation.topicId} not found.`)
      }
      runtime.inverse.unshift({
        type: 'mindmap.branch.field.set',
        id: operation.id,
        topicId: operation.topicId,
        field: operation.field,
        value: cloneValue(member.branchStyle[operation.field])
      })
      runtime.draft.mindmaps.set(operation.id, {
        ...current,
        members: {
          ...current.members,
          [operation.topicId]: {
            ...member,
            branchStyle: {
              ...member.branchStyle,
              [operation.field]: undefined
            }
          }
        }
      })
      markChange(runtime.changes.mindmaps, 'update', operation.id)
      runtime.queueMindmapLayout(operation.id)
      return
    }
    case 'mindmap.topic.collapse': {
      const current = getMindmap(runtime.draft, operation.id)
      if (!current) {
        return err('invalid', `Mindmap ${operation.id} not found.`)
      }
      const member = current.members[operation.topicId]
      if (!member) {
        return err('invalid', `Topic ${operation.topicId} not found.`)
      }
      runtime.inverse.unshift({
        type: 'mindmap.topic.collapse',
        id: operation.id,
        topicId: operation.topicId,
        collapsed: member.collapsed
      })
      runtime.draft.mindmaps.set(operation.id, {
        ...current,
        members: {
          ...current.members,
          [operation.topicId]: {
            ...member,
            collapsed: operation.collapsed ?? !member.collapsed
          }
        }
      })
      markChange(runtime.changes.mindmaps, 'update', operation.id)
      runtime.queueMindmapLayout(operation.id)
      return
    }
  }
}
