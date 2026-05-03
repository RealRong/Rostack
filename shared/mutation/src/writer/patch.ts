import type {
  MutationTreeSnapshot,
} from '../schema/constants'
import type {
  MutationDictionaryNode,
  MutationFieldNode,
  MutationObjectNode,
  MutationSequenceNode,
  MutationShape,
  MutationShapeNode,
  MutationTreeNode
} from '../schema/node'
import {
  isMutationGroup,
  isMutationNode
} from '../schema/node'
import type {
  MutationWrite
} from './writes'

const emitFieldPatch = (
  node: MutationFieldNode<unknown>,
  value: unknown,
  targetId: string | undefined,
  writes: MutationWrite[]
) => {
  writes.push({
    kind: 'field.set',
    node,
    ...(targetId === undefined ? {} : { targetId }),
    value
  })
}

const emitDictionaryPatch = (
  node: MutationDictionaryNode<string, unknown>,
  value: unknown,
  targetId: string | undefined,
  writes: MutationWrite[]
) => {
  writes.push({
    kind: 'dictionary.replace',
    node,
    ...(targetId === undefined ? {} : { targetId }),
    value: (value ?? {}) as Readonly<Record<string, unknown>>
  })
}

const emitSequencePatch = (
  node: MutationSequenceNode<unknown>,
  value: unknown,
  targetId: string | undefined,
  writes: MutationWrite[]
) => {
  writes.push({
    kind: 'sequence.replace',
    node: node as MutationSequenceNode<string>,
    ...(targetId === undefined ? {} : { targetId }),
    value: Array.isArray(value)
      ? value as readonly string[]
      : []
  })
}

const emitTreePatch = (
  node: MutationTreeNode<string, unknown>,
  value: unknown,
  targetId: string | undefined,
  writes: MutationWrite[]
) => {
  writes.push({
    kind: 'tree.replace',
    node,
    ...(targetId === undefined ? {} : { targetId }),
    value: value as MutationTreeSnapshot<unknown>
  })
}

const emitObjectPatch = (
  node: MutationObjectNode<MutationShape>,
  value: unknown,
  targetId: string | undefined,
  writes: MutationWrite[]
) => {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
  ) {
    return
  }

  emitShapePatch(
    node.shape,
    value as Record<string, unknown>,
    targetId,
    writes
  )
}

const emitNodePatch = (
  entry: MutationShapeNode | MutationShape,
  value: unknown,
  targetId: string | undefined,
  writes: MutationWrite[]
) => {
  if (!isMutationNode(entry)) {
    if (
      typeof value !== 'object'
      || value === null
      || Array.isArray(value)
    ) {
      return
    }
    emitShapePatch(
      entry,
      value as Record<string, unknown>,
      targetId,
      writes
    )
    return
  }

  switch (entry.kind) {
    case 'field':
      emitFieldPatch(entry, value, targetId, writes)
      return
    case 'object':
      emitObjectPatch(entry, value, targetId, writes)
      return
    case 'dictionary':
      emitDictionaryPatch(entry, value, targetId, writes)
      return
    case 'sequence':
      emitSequencePatch(entry, value, targetId, writes)
      return
    case 'tree':
      emitTreePatch(entry as MutationTreeNode<string, unknown>, value, targetId, writes)
      return
    case 'singleton':
    case 'table':
    case 'map':
      return
  }
}

export const emitShapePatch = (
  shape: MutationShape,
  patch: Record<string, unknown>,
  targetId: string | undefined,
  writes: MutationWrite[]
): void => {
  Object.entries(patch).forEach(([key, value]) => {
    const entry = shape[key]
    if (!entry) {
      return
    }
    emitNodePatch(entry, value, targetId, writes)
  })
}

export const hasWritableDocumentMembers = (
  shape: MutationShape
): boolean => Object.values(shape).some((value) => (
  isMutationNode(value)
  && (
    value.kind === 'field'
    || value.kind === 'object'
    || value.kind === 'dictionary'
    || value.kind === 'sequence'
    || value.kind === 'tree'
  )
))
