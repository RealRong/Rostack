import {
  createWhiteboardLayout,
  type LayoutBackend,
  type LayoutNodeCatalog
} from '@whiteboard/core/layout'

export const TEST_LAYOUT_CATALOG: LayoutNodeCatalog = {
  text: 'size',
  sticky: 'fit',
  frame: 'none',
  shape: 'none',
  draw: 'none',
  mindmap: 'none'
}

export const createReactTestLayout = (
  backend: LayoutBackend = {
    measure: () => undefined
  }
) => createWhiteboardLayout({
  nodes: TEST_LAYOUT_CATALOG,
  backend
})
