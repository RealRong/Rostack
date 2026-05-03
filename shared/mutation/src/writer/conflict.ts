import {
  targetIdToScope,
} from '../internal/state'
import type {
  MutationWrite,
} from './writes'
import {
  getNodeMeta,
} from '../schema/meta'
import {
  getSchemaNodeId,
} from '../schema/internals'

export type MutationConflictEntityRef = {
  nodeId: string
  scope: readonly string[]
}

type MutationConflictOwnedScopeBase = {
  entityAncestors: readonly MutationConflictEntityRef[]
}

export type MutationConflictScope =
  | {
      kind: 'document-reset'
    }
  | {
      kind: 'entity-existence'
      nodeId: string
      scope: readonly string[]
    }
  | ({
      kind: 'collection-order'
      nodeId: string
      scope: readonly string[]
    } & MutationConflictOwnedScopeBase)
  | ({
      kind: 'field'
      nodeId: string
      scope: readonly string[]
    } & MutationConflictOwnedScopeBase)
  | ({
      kind: 'dictionary-entry'
      nodeId: string
      scope: readonly string[]
      key: string
    } & MutationConflictOwnedScopeBase)
  | ({
      kind: 'dictionary-all'
      nodeId: string
      scope: readonly string[]
    } & MutationConflictOwnedScopeBase)
  | ({
      kind: 'sequence'
      nodeId: string
      scope: readonly string[]
    } & MutationConflictOwnedScopeBase)
  | ({
      kind: 'tree-structure'
      nodeId: string
      scope: readonly string[]
    } & MutationConflictOwnedScopeBase)
  | ({
      kind: 'tree-node'
      nodeId: string
      scope: readonly string[]
      treeNodeId: string
    } & MutationConflictOwnedScopeBase)

const sameScope = (
  left: readonly string[],
  right: readonly string[]
): boolean => left.length === right.length
  && left.every((value, index) => value === right[index])

const sameEntityRef = (
  left: MutationConflictEntityRef,
  right: MutationConflictEntityRef
): boolean => left.nodeId === right.nodeId
  && sameScope(left.scope, right.scope)

const buildEntityAncestors = (
  node: MutationWrite['node'],
  scope: readonly string[]
): readonly MutationConflictEntityRef[] => {
  const walk = (
    owner: ReturnType<typeof getNodeMeta>['owner'],
    currentScope: readonly string[]
  ): readonly MutationConflictEntityRef[] => {
    switch (owner.kind) {
      case 'document':
        return []
      case 'singleton': {
        const nodeId = getSchemaNodeId(owner.node)
        return [
          ...walk(getNodeMeta(owner.node).owner, currentScope),
          {
            nodeId,
            scope: currentScope
          }
        ]
      }
      case 'table':
      case 'map': {
        const nodeId = getSchemaNodeId(owner.node)
        const parentScope = currentScope.slice(0, -1)
        return [
          ...walk(getNodeMeta(owner.node).owner, parentScope),
          {
            nodeId,
            scope: currentScope
          }
        ]
      }
    }
  }

  return walk(getNodeMeta(node).owner, scope)
}

const toOwnedScopeBase = (
  node: MutationWrite['node'],
  scope: readonly string[]
): MutationConflictOwnedScopeBase => ({
  entityAncestors: buildEntityAncestors(node, scope)
})

const scopeIncludesEntity = (
  scope: MutationConflictScope,
  entity: MutationConflictEntityRef
): boolean => 'entityAncestors' in scope
  && scope.entityAncestors.some((entry) => sameEntityRef(entry, entity))

export const createMutationConflictScopes = (
  writes: readonly MutationWrite[]
): readonly MutationConflictScope[] => writes.flatMap<MutationConflictScope>((write): readonly MutationConflictScope[] => {
  const nodeId = getSchemaNodeId(write.node)
  const scope = targetIdToScope(write.targetId)

  switch (write.kind) {
    case 'entity.create':
    case 'entity.remove':
      return [
        {
          kind: 'entity-existence',
          nodeId,
          scope
        },
        ...(write.node.kind === 'table'
          ? [{
              kind: 'collection-order' as const,
              nodeId,
              scope: scope.slice(0, -1),
              ...toOwnedScopeBase(write.node, scope.slice(0, -1))
            }]
          : [])
      ]
    case 'entity.replace':
      return [{
        kind: 'entity-existence',
        nodeId,
        scope
      }]
    case 'entity.move':
      return [{
        kind: 'collection-order',
        nodeId,
        scope: scope.slice(0, -1),
        ...toOwnedScopeBase(write.node, scope.slice(0, -1))
      }]
    case 'field.set':
      return [{
        kind: 'field',
        nodeId,
        scope,
        ...toOwnedScopeBase(write.node, scope)
      }]
    case 'dictionary.set':
    case 'dictionary.delete':
      return [{
        kind: 'dictionary-entry',
        nodeId,
        scope,
        key: write.key,
        ...toOwnedScopeBase(write.node, scope)
      }]
    case 'dictionary.replace':
      return [{
        kind: 'dictionary-all',
        nodeId,
        scope,
        ...toOwnedScopeBase(write.node, scope)
      }]
    case 'sequence.insert':
      return [{
        kind: 'sequence',
        nodeId,
        scope,
        ...toOwnedScopeBase(write.node, scope)
      }]
    case 'sequence.move':
      return [{
        kind: 'sequence',
        nodeId,
        scope,
        ...toOwnedScopeBase(write.node, scope)
      }]
    case 'sequence.remove':
      return [{
        kind: 'sequence',
        nodeId,
        scope,
        ...toOwnedScopeBase(write.node, scope)
      }]
    case 'sequence.replace':
      return [{
        kind: 'sequence',
        nodeId,
        scope,
        ...toOwnedScopeBase(write.node, scope)
      }]
    case 'tree.insert':
      return [{
        kind: 'tree-structure',
        nodeId,
        scope,
        ...toOwnedScopeBase(write.node, scope)
      }]
    case 'tree.move':
      return [{
        kind: 'tree-structure',
        nodeId,
        scope,
        ...toOwnedScopeBase(write.node, scope)
      }]
    case 'tree.remove':
      return [{
        kind: 'tree-structure',
        nodeId,
        scope,
        ...toOwnedScopeBase(write.node, scope)
      }]
    case 'tree.replace':
      return [{
        kind: 'tree-structure',
        nodeId,
        scope,
        ...toOwnedScopeBase(write.node, scope)
      }]
    case 'tree.patch':
      return [{
        kind: 'tree-node',
        nodeId,
        scope,
        treeNodeId: write.nodeId,
        ...toOwnedScopeBase(write.node, scope)
      }]
  }
})

export const mutationConflictScopesIntersect = (
  left: MutationConflictScope,
  right: MutationConflictScope
): boolean => {
  if (left.kind === 'document-reset' || right.kind === 'document-reset') {
    return true
  }

  if (left.kind === 'entity-existence' && right.kind === 'entity-existence') {
    return left.nodeId === right.nodeId
      && sameScope(left.scope, right.scope)
  }

  if (left.kind === 'entity-existence') {
    return scopeIncludesEntity(right, {
      nodeId: left.nodeId,
      scope: left.scope
    })
  }

  if (right.kind === 'entity-existence') {
    return scopeIncludesEntity(left, {
      nodeId: right.nodeId,
      scope: right.scope
    })
  }

  if (left.kind === 'collection-order' && right.kind === 'collection-order') {
    return left.nodeId === right.nodeId
      && sameScope(left.scope, right.scope)
  }

  if (left.kind === 'field' && right.kind === 'field') {
    return left.nodeId === right.nodeId
      && sameScope(left.scope, right.scope)
  }

  if (left.kind === 'dictionary-all' && right.kind === 'dictionary-all') {
    return left.nodeId === right.nodeId
      && sameScope(left.scope, right.scope)
  }

  if (left.kind === 'dictionary-entry' && right.kind === 'dictionary-entry') {
    return left.nodeId === right.nodeId
      && sameScope(left.scope, right.scope)
      && left.key === right.key
  }

  if (left.kind === 'dictionary-all' && right.kind === 'dictionary-entry') {
    return left.nodeId === right.nodeId
      && sameScope(left.scope, right.scope)
  }

  if (left.kind === 'dictionary-entry' && right.kind === 'dictionary-all') {
    return left.nodeId === right.nodeId
      && sameScope(left.scope, right.scope)
  }

  if (left.kind === 'sequence' && right.kind === 'sequence') {
    return left.nodeId === right.nodeId
      && sameScope(left.scope, right.scope)
  }

  if (left.kind === 'tree-structure' && right.kind === 'tree-structure') {
    return left.nodeId === right.nodeId
      && sameScope(left.scope, right.scope)
  }

  if (left.kind === 'tree-node' && right.kind === 'tree-node') {
    return left.nodeId === right.nodeId
      && sameScope(left.scope, right.scope)
      && left.treeNodeId === right.treeNodeId
  }

  if (left.kind === 'tree-structure' && right.kind === 'tree-node') {
    return left.nodeId === right.nodeId
      && sameScope(left.scope, right.scope)
  }

  if (left.kind === 'tree-node' && right.kind === 'tree-structure') {
    return left.nodeId === right.nodeId
      && sameScope(left.scope, right.scope)
  }

  return false
}
