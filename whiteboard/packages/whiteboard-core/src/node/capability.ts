export type NodeRole = 'content' | 'frame'

export type NodeTransform = {
  resize: boolean
  rotate: boolean
}

type NodeBehaviorLike = {
  role?: NodeRole
  connect?: boolean
  enter?: boolean
  canResize?: boolean
  canRotate?: boolean
}

export const resolveNodeRole = (
  definition?: Pick<NodeBehaviorLike, 'role'>
): NodeRole => definition?.role ?? 'content'

export const resolveNodeTransform = (
  definition?: Pick<NodeBehaviorLike, 'role' | 'canResize' | 'canRotate'>
): NodeTransform => ({
  resize: definition?.canResize ?? true,
  rotate:
    typeof definition?.canRotate === 'boolean'
      ? definition.canRotate
      : resolveNodeRole(definition) === 'content'
})

export const resolveNodeConnect = (
  definition?: Pick<NodeBehaviorLike, 'connect'>
) => definition?.connect ?? true

export const resolveNodeEnter = (
  definition?: Pick<NodeBehaviorLike, 'enter'>
) => definition?.enter ?? false
