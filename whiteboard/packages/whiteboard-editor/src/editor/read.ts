import {
  createDerivedStore,
  read as readValue
} from '@shared/core'
import type {
  EditorChromePresentation,
  EditorPanelPresentation,
  EditorRead
} from '@whiteboard/editor/types/editor'
import type { EditorQuery } from '@whiteboard/editor/query'

export const projectEditorRead = (
  query: EditorQuery
): EditorRead => {
  const chrome = createDerivedStore<EditorChromePresentation>({
    get: () => ({
      marquee: readValue(query.preview.marquee),
      draw: readValue(query.preview.draw),
      edgeGuide: readValue(query.preview.edgeGuide),
      snap: readValue(query.preview.snap),
      selection: readValue(query.selection.presentation.overlay)
    }),
    isEqual: (left, right) => (
      left.marquee === right.marquee
      && left.draw === right.draw
      && left.edgeGuide === right.edgeGuide
      && left.snap === right.snap
      && left.selection === right.selection
    )
  })
  const panel = createDerivedStore<EditorPanelPresentation>({
    get: () => ({
      selectionToolbar: readValue(query.selection.presentation.toolbar),
      history: readValue(query.history),
      draw: readValue(query.draw)
    }),
    isEqual: (left, right) => (
      left.selectionToolbar === right.selectionToolbar
      && left.history === right.history
      && left.draw === right.draw
    )
  })

  return {
    document: {
      background: query.document.background,
      bounds: query.document.bounds
    },
    group: {
      exactIds: query.group.exactIds
    },
    history: query.history,
    mindmap: {
      render: query.mindmap.render
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
      node: query.selection.presentation.node,
      box: query.selection.presentation.box
    },
    tool: query.tool,
    viewport: query.viewport,
    chrome,
    panel
  }
}
