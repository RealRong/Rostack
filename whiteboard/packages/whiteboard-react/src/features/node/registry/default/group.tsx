import type { CSSProperties } from 'react'
import type { NodeDefinition, NodeRenderProps } from '../../../../types/node'

const groupStyle = (_props: NodeRenderProps): CSSProperties => ({
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  boxShadow: 'none',
  display: 'block'
})

export const GroupNodeDefinition: NodeDefinition = {
  type: 'group',
  meta: {
    name: 'Group',
    family: 'container',
    icon: 'group',
    controls: []
  },
  role: 'group',
  geometry: 'rect',
  render: () => null,
  style: groupStyle,
  connect: false,
  canResize: false,
  canRotate: false
}
