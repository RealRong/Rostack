import {
  path as mutationPath,
  type Path
} from '@shared/mutation'
import type { NodeModel, NodeSchema, NodeType, SchemaField } from '@whiteboard/core/types'
import { resolvePaletteColor } from '@whiteboard/react/features/palette'

export const getDataString = (node: Pick<NodeModel, 'data'>, key: string) => {
  const value = node.data && node.data[key]
  return typeof value === 'string' ? value : ''
}

export const getDataBool = (node: Pick<NodeModel, 'data'>, key: string) => {
  const value = node.data && node.data[key]
  return typeof value === 'boolean' ? value : false
}

export const getStyleString = (node: Pick<NodeModel, 'style'>, key: string) => {
  const value = node.style && node.style[key]
  return typeof value === 'string'
    ? resolvePaletteColor(value) ?? value
    : undefined
}

export const getStyleNumber = (node: Pick<NodeModel, 'style'>, key: string) => {
  const value = node.style && node.style[key]
  return typeof value === 'number' ? value : undefined
}

export const getStyleNumberArray = (node: Pick<NodeModel, 'style'>, key: string) => {
  const value = node.style && node.style[key]
  return Array.isArray(value) && value.every((item) => typeof item === 'number')
    ? value
    : undefined
}

export const getNodeLabel = (node: Pick<NodeModel, 'data'>, fallback: string) =>
  getDataString(node, 'title') || getDataString(node, 'text') || fallback

const createField = (
  scope: 'data' | 'style',
  path: Path,
  label: string,
  type: SchemaField['type'],
  extra: Partial<SchemaField> = {}
): SchemaField => ({
  id: `${scope}.${mutationPath.toString(path)}`,
  label,
  type,
  scope,
  path,
  ...extra
})

export const dataField = (
  path: Path,
  label: string,
  type: SchemaField['type'],
  extra?: Partial<SchemaField>
) => createField('data', path, label, type, extra)

export const styleField = (
  path: Path,
  label: string,
  type: SchemaField['type'],
  extra?: Partial<SchemaField>
) => createField('style', path, label, type, extra)

export const createTextField = (field: 'title' | 'text') =>
  dataField(
    mutationPath.of(field),
    field === 'title' ? 'Title' : 'Text',
    field === 'title' ? 'string' : 'text'
  )

export const createSchema = (
  type: NodeType,
  label: string,
  fields: NodeSchema['fields']
): NodeSchema => ({
  type,
  label,
  fields
})
