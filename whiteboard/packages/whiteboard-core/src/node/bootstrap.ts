import type { Size, SpatialNodeInput } from '@whiteboard/core/types'
import { readTextWrapWidth } from '@whiteboard/core/node/text'

export const TEXT_BOOTSTRAP_SIZE = {
  width: 144,
  height: 20
} as const

const isFinitePositive = (
  value: unknown
): value is number => typeof value === 'number'
  && Number.isFinite(value)
  && value > 0

const resolveExplicitSize = (
  size: SpatialNodeInput['size']
): Size | undefined => {
  if (!size) {
    return undefined
  }

  const width = isFinitePositive(size.width) ? size.width : undefined
  const height = isFinitePositive(size.height) ? size.height : undefined

  if (width === undefined || height === undefined) {
    return undefined
  }

  return {
    width,
    height
  }
}

export const resolveTextNodeBootstrapSize = (
  node: Pick<SpatialNodeInput, 'size' | 'data'>
): Size => ({
  width: isFinitePositive(node.size?.width)
    ? node.size.width
    : (readTextWrapWidth({
        type: 'text',
        data: node.data
      }) ?? TEXT_BOOTSTRAP_SIZE.width),
  height: isFinitePositive(node.size?.height)
    ? node.size.height
    : TEXT_BOOTSTRAP_SIZE.height
})

export const resolveNodeBootstrapSize = (
  node: Pick<SpatialNodeInput, 'type' | 'size' | 'data'>
): Size | undefined => {
  if (node.type === 'text') {
    return resolveTextNodeBootstrapSize(node)
  }

  return resolveExplicitSize(node.size)
}
