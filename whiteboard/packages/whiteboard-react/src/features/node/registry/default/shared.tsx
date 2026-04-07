import type { Node, NodeSchema, NodeType, SchemaField } from '@whiteboard/core/types'

export const getDataString = (node: Node, key: string) => {
  const value = node.data && node.data[key]
  return typeof value === 'string' ? value : ''
}

export const getDataBool = (node: Node, key: string) => {
  const value = node.data && node.data[key]
  return typeof value === 'boolean' ? value : false
}

export const getStyleString = (node: Node, key: string) => {
  const value = node.style && node.style[key]
  return typeof value === 'string' ? value : undefined
}

export const getStyleNumber = (node: Node, key: string) => {
  const value = node.style && node.style[key]
  return typeof value === 'number' ? value : undefined
}

export const getStyleNumberArray = (node: Node, key: string) => {
  const value = node.style && node.style[key]
  return Array.isArray(value) && value.every((item) => typeof item === 'number')
    ? value
    : undefined
}

export const getNodeLabel = (node: Node, fallback: string) =>
  getDataString(node, 'title') || getDataString(node, 'text') || fallback

const createField = (
  scope: 'data' | 'style',
  path: string,
  label: string,
  type: SchemaField['type'],
  extra: Partial<SchemaField> = {}
): SchemaField => ({
  id: `${scope}.${path}`,
  label,
  type,
  scope,
  path,
  ...extra
})

export const dataField = (
  path: string,
  label: string,
  type: SchemaField['type'],
  extra?: Partial<SchemaField>
) => createField('data', path, label, type, extra)

export const styleField = (
  path: string,
  label: string,
  type: SchemaField['type'],
  extra?: Partial<SchemaField>
) => createField('style', path, label, type, extra)

export const createTextField = (path: 'title' | 'text') =>
  dataField(path, path === 'title' ? 'Title' : 'Text', path === 'title' ? 'string' : 'text')

export const createSchema = (
  type: NodeType,
  label: string,
  fields: NodeSchema['fields']
): NodeSchema => ({
  type,
  label,
  fields
})
