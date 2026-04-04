import { useEffect } from 'react'
import type { WhiteboardInstance as Editor } from '../../types/runtime'

export const EditorLifecycle = ({
  editor,
  editorConfig
}: {
  editor: Editor
  editorConfig: Parameters<Editor['configure']>[0]
}) => {
  useEffect(() => () => {
    editor.dispose()
  }, [editor])

  useEffect(() => {
    editor.configure(editorConfig)
  }, [editor, editorConfig])

  return null
}
