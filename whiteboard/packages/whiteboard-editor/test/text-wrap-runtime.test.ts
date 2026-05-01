import { afterEach, describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { editor as editorApi } from '../src'
import type {
  LayoutBackend,
  NodeSpec
} from '../src'
import { createEditorTestLayout } from './support'

const createNodes = (): NodeSpec => ({
  text: {
    meta: {
      type: 'text',
      name: 'Text',
      family: 'text',
      icon: 'text',
      controls: []
    },
    behavior: {
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
  },
  sticky: {
    meta: {
      type: 'sticky',
      name: 'Sticky',
      family: 'text',
      icon: 'sticky',
      controls: []
    },
    behavior: {
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
  const layoutService = createEditorTestLayout(createLayoutBackend())
  const engine = engineApi.create({
    document: createTextDocument(),
    layout: layoutService
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
    nodes: createNodes(),
    services: {
      layout: layoutService
    }
  }))
}

const createAutoWidthTextEditor = () => {
  const layoutService = createEditorTestLayout(createAutoWidthLayoutBackend())
  const engine = engineApi.create({
    document: createTextDocument(),
    layout: layoutService
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
    nodes: createNodes(),
    services: {
      layout: layoutService
    }
  }))
}

const createStickyEditor = () => {
  const layoutService = createEditorTestLayout(createLayoutBackend())
  const engine = engineApi.create({
    document: createStickyDocument(),
    layout: layoutService
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
    nodes: createNodes(),
    services: {
      layout: layoutService
    }
  }))
}

describe('text wrap runtime', () => {
  it('projects auto-width text rect from live edit layout before commit', async () => {
    const editor = createAutoWidthTextEditor()

    expect(editor.scene.nodes.get('text-1')?.geometry.rect).toMatchObject({
      width: 100,
      height: 24
    })

    editor.write.edit.startNode('text-1', 'text')
    editor.write.edit.input('hello world!!!')

    expect(editor.scene.ui.state.edit.get()).toMatchObject({
      kind: 'node',
      nodeId: 'text-1'
    })
    expect(editor.scene.nodes.get('text-1')?.geometry.rect).toMatchObject({
      width: 280,
      height: 24
    })
    expect(editor.scene.document.snapshot().nodes['text-1']?.size).toMatchObject({
      width: 100,
      height: 24
    })
  })

  it('preserves wrap width when entering edit after a text patch commit', async () => {
    const editor = createTextEditor()

    editor.write.node.patch(['text-1'], {
      fields: {
        size: {
          width: 180,
          height: 24
        }
      },
      record: {
        'data.widthMode': 'wrap',
        'data.wrapWidth': 180
      }
    })

    expect(editor.scene.document.snapshot().nodes['text-1']?.data).toMatchObject({
      widthMode: 'wrap',
      wrapWidth: 180
    })
    expect(editor.scene.nodes.get('text-1')?.geometry.rect).toMatchObject({
      width: 180,
      height: 24
    })

    editor.write.edit.startNode('text-1', 'text')
    editor.write.edit.input('this stays wrapped at the committed width')

    expect(editor.scene.ui.state.edit.get()).toMatchObject({
      kind: 'node',
      nodeId: 'text-1'
    })
    expect(editor.scene.nodes.get('text-1')?.geometry.rect).toMatchObject({
      width: 180,
      height: 24
    })
  })

  it('recomputes wrap text size when font size changes via text command', () => {
    const editor = createTextEditor()

    editor.write.node.patch(['text-1'], {
      fields: {
        size: {
          width: 180,
          height: 24
        }
      },
      record: {
        'data.widthMode': 'wrap',
        'data.wrapWidth': 180
      }
    })

    editor.write.node.text.size({
      nodeIds: ['text-1'],
      value: 20
    })

    expect(editor.scene.document.snapshot().nodes['text-1']?.style).toMatchObject({
      fontSize: 20
    })
    expect(editor.scene.nodes.get('text-1')?.geometry.rect).toMatchObject({
      width: 180,
      height: 48
    })
  })

  it('recomputes wrap text size when font size changes via generic node patch', () => {
    const editor = createTextEditor()

    editor.write.node.patch(['text-1'], {
      fields: {
        size: {
          width: 180,
          height: 24
        }
      },
      record: {
        'data.widthMode': 'wrap',
        'data.wrapWidth': 180
      }
    })

    editor.write.node.patch(
      ['text-1'],
      {
        record: {
          'style.fontSize': 20
        }
      }
    )

    expect(editor.scene.document.snapshot().nodes['text-1']?.style).toMatchObject({
      fontSize: 20
    })
    expect(editor.scene.nodes.get('text-1')?.geometry.rect).toMatchObject({
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

    expect(editor.scene.document.snapshot().nodes['sticky-1']?.rotation).toBe(45)
    expect(editor.scene.document.snapshot().nodes['sticky-1']?.style).toMatchObject({
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

    expect(editor.scene.document.snapshot().nodes['sticky-1']?.style).toMatchObject({
      fontSize: 18
    })
    expect(editor.scene.nodes.get('sticky-1')?.geometry.rect).toMatchObject({
      width: 100,
      height: 140
    })
  })

  it('switches sticky to fixed mode when font size is manually set', () => {
    const editor = createStickyEditor()

    editor.write.node.patch(
      ['sticky-1'],
      {
        record: {
          'style.fontSize': 32
        }
      }
    )

    expect(editor.scene.document.snapshot().nodes['sticky-1']?.data).toMatchObject({
      fontMode: 'fixed'
    })
    expect(editor.scene.document.snapshot().nodes['sticky-1']?.style).toMatchObject({
      fontSize: 32
    })
  })
})
