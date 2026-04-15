import { describe, expect, it } from 'vitest'
import { createDocument } from '@whiteboard/core/document'
import {
  compileNodeDataUpdate,
  compileNodeStyleUpdate,
  mergeNodeUpdates
} from '@whiteboard/core/schema'
import { createEngine } from '@whiteboard/engine'
import { createEditor } from '../src'
import type {
  LayoutBackend,
  NodeRegistry
} from '../src'

const createRegistry = (): NodeRegistry => ({
  get: (type) => {
    if (type === 'text') {
      return {
        type: 'text',
        meta: {
          name: 'Text',
          family: 'text',
          icon: 'text',
          controls: []
        },
        layout: {
          kind: 'size'
        },
        role: 'content',
        canResize: true,
        canRotate: true,
        enter: true,
        edit: {
          fields: {
            text: {
              multiline: true,
              empty: 'remove'
            }
          }
        }
      }
    }

    if (type === 'sticky') {
      return {
        type: 'sticky',
        meta: {
          name: 'Sticky',
          family: 'text',
          icon: 'sticky',
          controls: []
        },
        layout: {
          kind: 'fit'
        },
        role: 'content',
        canResize: true,
        canRotate: true,
        enter: true,
        edit: {
          fields: {
            text: {
              multiline: true,
              empty: 'keep'
            }
          }
        }
      }
    }

    return undefined
  }
})

const createLayoutBackend = (): LayoutBackend => ({
  measure: (request) => {
    if (request.kind === 'size') {
      return {
        kind: 'size',
        size: {
          width: request.widthMode === 'wrap'
            ? (request.wrapWidth ?? 100)
            : 100,
          height:
            request.fontSize >= 20
              ? 48
              : 24
        }
      }
    }

    return {
      kind: 'fit',
      fontSize: request.box.width <= 120
        ? 18
        : 28
    }
  }
})

const createTextDocument = () => {
  const document = createDocument('doc_text_wrap_runtime')
  document.nodes['text-1'] = {
    id: 'text-1',
    type: 'text',
    position: {
      x: 0,
      y: 0
    },
    size: {
      width: 100,
      height: 24
    },
    data: {
      text: 'hello world'
    }
  }
  document.order = [{
    kind: 'node',
    id: 'text-1'
  }]
  return document
}

const createStickyDocument = () => {
  const document = createDocument('doc_sticky_layout_runtime')
  document.nodes['sticky-1'] = {
    id: 'sticky-1',
    type: 'sticky',
    position: {
      x: 0,
      y: 0
    },
    size: {
      width: 180,
      height: 140
    },
    data: {
      text: 'sticky',
      fontMode: 'auto'
    },
    style: {
      fontSize: 28
    }
  }
  document.order = [{
    kind: 'node',
    id: 'sticky-1'
  }]
  return document
}

const createTextEditor = () => createEditor({
  engine: createEngine({
    document: createTextDocument()
  }),
  initialTool: {
    type: 'select'
  },
  initialViewport: {
    center: {
      x: 0,
      y: 0
    },
    zoom: 1
  },
  registry: createRegistry(),
  services: {
    layout: createLayoutBackend()
  }
})

const createStickyEditor = () => createEditor({
  engine: createEngine({
    document: createStickyDocument()
  }),
  initialTool: {
    type: 'select'
  },
  initialViewport: {
    center: {
      x: 0,
      y: 0
    },
    zoom: 1
  },
  registry: createRegistry(),
  services: {
    layout: createLayoutBackend()
  }
})

describe('text wrap runtime', () => {
  it('preserves wrap width when entering edit after a text patch commit', () => {
    const editor = createTextEditor()

    editor.actions.node.patch(['text-1'], mergeNodeUpdates(
      {
        fields: {
          size: {
            width: 180,
            height: 24
          }
        }
      },
      compileNodeDataUpdate('widthMode', 'wrap'),
      compileNodeDataUpdate('wrapWidth', 180)
    ))

    expect(editor.read.node.committed.get('text-1')?.node.data).toMatchObject({
      widthMode: 'wrap',
      wrapWidth: 180
    })
    expect(editor.read.node.item.get('text-1')?.rect).toMatchObject({
      width: 180,
      height: 24
    })

    editor.actions.edit.startNode('text-1', 'text')

    expect(editor.store.edit.get()).toMatchObject({
      kind: 'node',
      nodeId: 'text-1',
      layout: {
        wrapWidth: 180,
        size: {
          width: 180,
          height: 24
        }
      }
    })
  })

  it('recomputes wrap text size when font size changes via text command', () => {
    const editor = createTextEditor()

    editor.actions.node.patch(['text-1'], mergeNodeUpdates(
      {
        fields: {
          size: {
            width: 180,
            height: 24
          }
        }
      },
      compileNodeDataUpdate('widthMode', 'wrap'),
      compileNodeDataUpdate('wrapWidth', 180)
    ))

    editor.actions.node.text.size({
      nodeIds: ['text-1'],
      value: 20
    })

    expect(editor.read.node.committed.get('text-1')?.node.style).toMatchObject({
      fontSize: 20
    })
    expect(editor.read.node.committed.get('text-1')?.rect).toMatchObject({
      width: 180,
      height: 48
    })
  })

  it('recomputes wrap text size when font size changes via generic node patch', () => {
    const editor = createTextEditor()

    editor.actions.node.patch(['text-1'], mergeNodeUpdates(
      {
        fields: {
          size: {
            width: 180,
            height: 24
          }
        }
      },
      compileNodeDataUpdate('widthMode', 'wrap'),
      compileNodeDataUpdate('wrapWidth', 180)
    ))

    editor.actions.node.patch(
      ['text-1'],
      compileNodeStyleUpdate('fontSize', 20)
    )

    expect(editor.read.node.committed.get('text-1')?.node.style).toMatchObject({
      fontSize: 20
    })
    expect(editor.read.node.committed.get('text-1')?.rect).toMatchObject({
      width: 180,
      height: 48
    })
  })
})

describe('sticky fit runtime', () => {
  it('does not recompute auto font size when sticky only rotates', () => {
    const editor = createStickyEditor()

    editor.actions.node.patch(
      ['sticky-1'],
      {
        fields: {
          rotation: 45
        }
      }
    )

    expect(editor.read.node.committed.get('sticky-1')?.node.rotation).toBe(45)
    expect(editor.read.node.committed.get('sticky-1')?.node.style).toMatchObject({
      fontSize: 28
    })
  })

  it('recomputes auto font size when sticky size changes', () => {
    const editor = createStickyEditor()

    editor.actions.node.patch(
      ['sticky-1'],
      {
        fields: {
          size: {
            width: 100,
            height: 140
          }
        }
      }
    )

    expect(editor.read.node.committed.get('sticky-1')?.node.style).toMatchObject({
      fontSize: 18
    })
    expect(editor.read.node.committed.get('sticky-1')?.rect).toMatchObject({
      width: 100,
      height: 140
    })
  })

  it('switches sticky to fixed mode when font size is manually set', () => {
    const editor = createStickyEditor()

    editor.actions.node.patch(
      ['sticky-1'],
      compileNodeStyleUpdate('fontSize', 32)
    )

    expect(editor.read.node.committed.get('sticky-1')?.node.data).toMatchObject({
      fontMode: 'fixed'
    })
    expect(editor.read.node.committed.get('sticky-1')?.node.style).toMatchObject({
      fontSize: 32
    })
  })
})
