import {
  createWhiteboardLayout,
  type LayoutBackend,
  type LayoutNodeCatalog
} from '@whiteboard/core/layout'

const DEFAULT_LAYOUT_CATALOG: LayoutNodeCatalog = {
  text: 'size',
  sticky: 'fit',
  frame: 'none',
  shape: 'none',
  draw: 'none'
}

export const createTestLayout = (
  backend: LayoutBackend = {
    measure: () => undefined
  }
) => createWhiteboardLayout({
  nodes: DEFAULT_LAYOUT_CATALOG,
  backend
})
