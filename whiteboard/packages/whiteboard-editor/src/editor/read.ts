import { store } from '@shared/core'
import type {
  EditorChromePresentation,
  EditorPanelPresentation,
  EditorRead
} from '@whiteboard/editor/types/editor'
import type { EditorQuery } from '@whiteboard/editor/query'
import type { Engine } from '@whiteboard/engine'

export const createEditorRead = (
  {
    engine,
    query
  }: {
    engine: Pick<Engine, 'document'>
    query: EditorQuery
  }
): EditorRead => {
  const chrome = store.createDerivedStore<EditorChromePresentation>({
    get: () => ({
      marquee: store.read(query.chrome.marquee),
      draw: store.read(query.chrome.draw),
      edgeGuide: store.read(query.chrome.edgeGuide),
      snap: store.read(query.chrome.snap),
      selection: store.read(query.selection.overlay)
    }),
    isEqual: (left, right) => (
      left.marquee === right.marquee
      && left.draw === right.draw
      && left.edgeGuide === right.edgeGuide
      && left.snap === right.snap
      && left.selection === right.selection
    )
  })
  const panel = store.createDerivedStore<EditorPanelPresentation>({
    get: () => ({
      selectionToolbar: store.read(query.selection.toolbar),
      history: store.read(query.history),
      draw: store.read(query.draw)
    }),
    isEqual: (left, right) => (
      left.selectionToolbar === right.selectionToolbar
      && left.history === right.history
      && left.draw === right.draw
    )
  })

  return {
    document: {
      get: engine.document.get,
      background: query.document.background,
      bounds: query.document.bounds
    },
    group: {
      exactIds: query.group.exactIds
    },
    history: query.history,
    mindmap: {
      structure: query.mindmap.structure,
      layout: query.mindmap.layout,
      node: query.mindmap.node,
      scene: query.mindmap.scene,
      chrome: query.mindmap.chrome,
      navigate: query.mindmap.navigate
    },
    node: {
      render: query.node.render
    },
    edge: {
      render: query.edge.render,
      selectedChrome: query.edge.selectedChrome
    },
    scene: {
      list: query.scene.list
    },
    selection: {
      node: query.selection.node,
      summary: query.selection.summary
    },
    tool: query.tool,
    viewport: query.viewport,
    chrome,
    panel
  }
}
