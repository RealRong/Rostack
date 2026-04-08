import { useEffect } from 'react'
import type { WhiteboardInstance as Editor } from '#react/types/runtime'

export const EditorLifecycle = ({
  editor,
  editorConfig,
  viewportLimits
}: {
  editor: Editor
  editorConfig: Parameters<Editor['configure']>[0]
  viewportLimits: {
    minZoom: number
    maxZoom: number
  }
}) => {
  useEffect(() => () => {
    editor.dispose()
  }, [editor])

  useEffect(() => {
    editor.configure(editorConfig)
  }, [editor, editorConfig])

  useEffect(() => {
    editor.commands.viewport.setLimits(viewportLimits)
  }, [editor, viewportLimits])

  return null
}
