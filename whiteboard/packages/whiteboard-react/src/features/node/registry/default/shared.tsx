import type { NodeModel } from '@whiteboard/core/types'
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
