import type {
  MutationMapNode,
  MutationShape,
  MutationShapeNode,
  MutationSingletonNode,
  MutationTableNode
} from './node'
import {
  MUTATION_SCHEMA
} from './constants'
import {
  isMutationGroup,
  isMutationNode
} from './node'
import {
  copyNodeAccess,
  setNodeMeta
} from './internals'
export {
  getNodeMeta
} from './internals'

export type MutationOwnerMeta =
  | {
      kind: 'document'
      path: readonly string[]
    }
  | {
      kind: 'singleton'
      path: readonly string[]
      node: MutationSingletonNode<MutationShape>
    }
  | {
      kind: 'table'
      path: readonly string[]
      node: MutationTableNode<string, MutationShape>
    }
  | {
      kind: 'map'
      path: readonly string[]
      node: MutationMapNode<string, MutationShape>
    }

export type MutationNodeMeta = {
  readonly key: string
  readonly path: readonly string[]
  readonly owner: MutationOwnerMeta
  readonly relativePath: readonly string[]
}

const cloneNode = <TNode extends MutationShapeNode>(
  node: TNode
): TNode => {
  switch (node.kind) {
    case 'field':
    case 'dictionary':
      return {
        ...node
      }
    case 'sequence':
    case 'tree':
      return copyNodeAccess(node, {
        ...node
      }) as TNode
    case 'object':
      return {
        ...node,
        shape: cloneShape(node.shape)
      } as TNode
    case 'singleton':
    case 'table':
    case 'map':
      return copyNodeAccess(node, {
        ...node,
        shape: cloneShape(node.shape)
      }) as TNode
  }
}

export const cloneShape = <TShape extends MutationShape>(
  shape: TShape
): TShape => Object.fromEntries(
  Object.entries(shape).map(([key, value]) => [
    key,
    isMutationNode(value)
      ? cloneNode(value)
      : cloneShape(value as MutationShape)
  ])
) as TShape

const attachShape = (
  shape: MutationShape,
  owner: MutationOwnerMeta,
  path: readonly string[],
  relativePath: readonly string[]
): void => {
  Object.entries(shape).forEach(([key, value]) => {
    const nextPath = [...path, key]
    const nextRelativePath = [...relativePath, key]

    if (isMutationNode(value)) {
      if (
        value.kind === 'singleton'
        || value.kind === 'table'
        || value.kind === 'map'
      ) {
        const familyOwner = {
          kind: value.kind,
          path: nextPath,
          node: value as MutationSingletonNode<MutationShape>
            | MutationTableNode<string, MutationShape>
            | MutationMapNode<string, MutationShape>
        } as MutationOwnerMeta

        setNodeMeta(value, {
          key,
          path: nextPath,
          owner,
          relativePath: nextRelativePath
        })
        attachShape(value.shape, familyOwner, nextPath, [])
        return
      }

      if (value.kind === 'object') {
        setNodeMeta(value, {
          key,
          path: nextPath,
          owner,
          relativePath: nextRelativePath
        })
        attachShape(value.shape, owner, nextPath, nextRelativePath)
        return
      }

      setNodeMeta(value, {
        key,
        path: nextPath,
        owner,
        relativePath: nextRelativePath
      })
      return
    }

    if (isMutationGroup(value)) {
      attachShape(
        value,
        owner,
        nextPath,
        nextRelativePath
      )
    }
  })
}

export const finalizeSchema = <TShape extends MutationShape>(
  shape: TShape
) => {
  const nextShape = cloneShape(shape)
  attachShape(
    nextShape,
    {
      kind: 'document',
      path: []
    },
    [],
    []
  )

  return {
    [MUTATION_SCHEMA]: true,
    shape: nextShape
  } as const
}
