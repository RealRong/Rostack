import { afterEach, describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { schema } from '@whiteboard/core/registry'
import { engine as engineApi } from '@whiteboard/engine'
import { editor as editorApi } from '../src'
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
        resize: true,
        rotate: true,
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
        resize: true,
        rotate: true,
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

const createAutoWidthLayoutBackend = (): LayoutBackend => ({
  measure: (request) => {
    if (request.kind === 'size') {
      return {
        kind: 'size',
        size: {
          width: request.widthMode === 'wrap'
            ? (request.wrapWidth ?? 100)
            : Math.max(100, request.text.length * 20),
          height: 24
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

const editors = new Set<{
  dispose: () => void
}>()

const trackEditor = <T extends { dispose: () => void }>(
  editor: T
): T => {
  editors.add(editor)
  return editor
}

afterEach(() => {
  editors.forEach((editor) => {
    editor.dispose()
  })
  editors.clear()
})

const createTextDocument = () => {
  const document = documentApi.create('doc_text_wrap_runtime')
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
  document.canvas.order = [{
    kind: 'node',
    id: 'text-1'
  }]
  return document
}

const createStickyDocument = () => {
  const document = documentApi.create('doc_sticky_layout_runtime')
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
  document.canvas.order = [{
    kind: 'node',
    id: 'sticky-1'
  }]
  return document
}

const createTextEditor = () => {
  const engine = engineApi.create({
    document: createTextDocument()
  })

  return trackEditor(editorApi.create({
    engine,
    history: engine.history,
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
  }))
}

const createAutoWidthTextEditor = () => {
  const engine = engineApi.create({
    document: createTextDocument()
  })

  return trackEditor(editorApi.create({
    engine,
    history: engine.history,
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
      layout: createAutoWidthLayoutBackend()
    }
  }))
}

const createStickyEditor = () => {
  const engine = engineApi.create({
    document: createStickyDocument()
  })

  return trackEditor(editorApi.create({
    engine,
    history: engine.history,
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
  }))
}

describe('text wrap runtime', () => {
  it('projects auto-width text rect from live edit layout before commit', () => {
    const editor = createAutoWidthTextEditor()

    expect(editor.scene.query.node.get('text-1')?.geometry.rect).toMatchObject({
      width: 100,
      height: 24
    })

    editor.write.edit.startNode('text-1', 'text')
    editor.write.edit.input('hello world!!!')

    expect(editor.session.edit.get()).toMatchObject({
      kind: 'node',
      nodeId: 'text-1'
    })
    expect(editor.scene.query.node.get('text-1')?.geometry.rect).toMatchObject({
      width: 280,
      height: 24
    })
    expect(editor.document.get().nodes['text-1']?.size).toMatchObject({
      width: 100,
      height: 24
    })
  })

  it('preserves wrap width when entering edit after a text patch commit', () => {
    const editor = createTextEditor()

    editor.write.node.patch(['text-1'], schema.node.mergeUpdates(
      {
        fields: {
          size: {
            width: 180,
            height: 24
          }
        }
      },
      schema.node.compileDataUpdate('widthMode', 'wrap'),
      schema.node.compileDataUpdate('wrapWidth', 180)
    ))

    expect(editor.document.get().nodes['text-1']?.data).toMatchObject({
      widthMode: 'wrap',
      wrapWidth: 180
    })
    expect(editor.scene.query.node.get('text-1')?.geometry.rect).toMatchObject({
      width: 180,
      height: 24
    })

    editor.write.edit.startNode('text-1', 'text')
    editor.write.edit.input('this stays wrapped at the committed width')

    expect(editor.session.edit.get()).toMatchObject({
      kind: 'node',
      nodeId: 'text-1'
    })
    expect(editor.scene.query.node.get('text-1')?.geometry.rect).toMatchObject({
      width: 180,
      height: 24
    })
  })

  it('recomputes wrap text size when font size changes via text command', () => {
    const editor = createTextEditor()

    editor.write.node.patch(['text-1'], schema.node.mergeUpdates(
      {
        fields: {
          size: {
            width: 180,
            height: 24
          }
        }
      },
      schema.node.compileDataUpdate('widthMode', 'wrap'),
      schema.node.compileDataUpdate('wrapWidth', 180)
    ))

    editor.write.node.text.size({
      nodeIds: ['text-1'],
      value: 20
    })

    expect(editor.document.get().nodes['text-1']?.style).toMatchObject({
      fontSize: 20
    })
    expect(editor.scene.query.node.get('text-1')?.geometry.rect).toMatchObject({
      width: 180,
      height: 48
    })
  })

  it('recomputes wrap text size when font size changes via generic node patch', () => {
    const editor = createTextEditor()

    editor.write.node.patch(['text-1'], schema.node.mergeUpdates(
      {
        fields: {
          size: {
            width: 180,
            height: 24
          }
        }
      },
      schema.node.compileDataUpdate('widthMode', 'wrap'),
      schema.node.compileDataUpdate('wrapWidth', 180)
    ))

    editor.write.node.patch(
      ['text-1'],
      schema.node.compileStyleUpdate('fontSize', 20)
    )

    expect(editor.document.get().nodes['text-1']?.style).toMatchObject({
      fontSize: 20
    })
    expect(editor.scene.query.node.get('text-1')?.geometry.rect).toMatchObject({
      width: 180,
      height: 48
    })
  })
})

describe('sticky fit runtime', () => {
  it('does not recompute auto font size when sticky only rotates', () => {
    const editor = createStickyEditor()

    editor.write.node.patch(
      ['sticky-1'],
      {
        fields: {
          rotation: 45
        }
      }
    )

    expect(editor.document.get().nodes['sticky-1']?.rotation).toBe(45)
    expect(editor.document.get().nodes['sticky-1']?.style).toMatchObject({
      fontSize: 28
    })
  })

  it('recomputes auto font size when sticky size changes', () => {
    const editor = createStickyEditor()

    editor.write.node.patch(
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

    expect(editor.document.get().nodes['sticky-1']?.style).toMatchObject({
      fontSize: 18
    })
    expect(editor.scene.query.node.get('sticky-1')?.geometry.rect).toMatchObject({
      width: 100,
      height: 140
    })
  })

  it('switches sticky to fixed mode when font size is manually set', () => {
    const editor = createStickyEditor()

    editor.write.node.patch(
      ['sticky-1'],
      schema.node.compileStyleUpdate('fontSize', 32)
    )

    expect(editor.document.get().nodes['sticky-1']?.data).toMatchObject({
      fontMode: 'fixed'
    })
    expect(editor.document.get().nodes['sticky-1']?.style).toMatchObject({
      fontSize: 32
    })
  })
})
