import {
  compileNodeFieldUpdate,
  compileNodeFieldUpdates,
  type NodeSchemaFieldRef
} from '@whiteboard/core/schema'
import type { Node, NodeStyleValue, NodeUpdateInput } from '@whiteboard/core/types'

export type NodeStylePatch = Record<string, NodeStyleValue>
export type NodeDataPatch = Record<string, unknown>

const getValueByPath = (value: unknown, path: string): unknown => {
  if (!path) return value
  const parts = path.split('.').filter(Boolean)
  let current: any = value
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = current[part]
  }
  return current
}

const hasValueByPath = (value: unknown, path: string): boolean =>
  getValueByPath(value, path) !== undefined

const readFieldContainer = (
  node: Pick<Node, 'data' | 'style'>,
  field: NodeSchemaFieldRef
) => (field.scope === 'style' ? node.style : node.data)

export const toNodeFieldUpdate = (
  field: NodeSchemaFieldRef,
  value: unknown
): NodeUpdateInput => compileNodeFieldUpdate(field, value)

export const toNodeFieldRemovalPatch = (
  node: Pick<Node, 'data' | 'style'>,
  field: NodeSchemaFieldRef
): NodeUpdateInput => (
  hasValueByPath(readFieldContainer(node, field), field.path)
    ? compileNodeFieldUpdate(field, undefined)
    : {}
)

export const toNodeDataPatch = (
  _node: Pick<Node, 'data'>,
  patch: NodeDataPatch
): NodeUpdateInput => compileNodeFieldUpdates(
  Object.entries(patch).map(([path, value]) => ({
    field: {
      scope: 'data' as const,
      path
    },
    value
  }))
)

export const toNodeStylePatch = (
  _node: Pick<Node, 'style'>,
  patch: NodeStylePatch
): NodeUpdateInput => compileNodeFieldUpdates(
  Object.entries(patch).map(([path, value]) => ({
    field: {
      scope: 'style' as const,
      path
    },
    value
  }))
)

export const toNodeStyleRemovalPatch = (
  node: Pick<Node, 'style'>,
  key: string
): NodeUpdateInput =>
  toNodeFieldRemovalPatch(node, {
    scope: 'style',
    path: key
  })

export const toNodeStyleUpdates = (
  nodes: readonly Node[],
  patch: NodeStylePatch
) => nodes.map((node) => ({
  id: node.id,
  update: toNodeStylePatch(node, patch)
}))
