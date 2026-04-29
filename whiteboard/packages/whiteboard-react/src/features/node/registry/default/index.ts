import type { LayoutNodeCatalog } from '@whiteboard/core/layout'
import type { NodeSpec } from '@whiteboard/react/types/node'
import { DrawNodeSpec } from '@whiteboard/react/features/node/registry/default/draw'
import { FrameNodeSpec } from '@whiteboard/react/features/node/registry/default/frame'
import { ShapeNodeSpec } from '@whiteboard/react/features/node/registry/default/shape'
import { StickyNodeSpec, TextNodeSpec } from '@whiteboard/react/features/node/registry/default/text'

export const nodeSpec: NodeSpec = {
  frame: FrameNodeSpec,
  shape: ShapeNodeSpec,
  draw: DrawNodeSpec,
  text: TextNodeSpec,
  sticky: StickyNodeSpec
}

export const nodeLayout: LayoutNodeCatalog = {
  frame: 'none',
  shape: 'none',
  draw: 'none',
  text: 'size',
  sticky: 'fit'
}
