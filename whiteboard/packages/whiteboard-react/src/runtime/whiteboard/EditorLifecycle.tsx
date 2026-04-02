import { useEffect } from 'react'
import type { WhiteboardInstance as Editor } from '../../types/runtime'

export const EditorLifecycle = ({
  editor,
  runtimeConfig
}: {
  editor: Editor
  runtimeConfig: Parameters<Editor['configure']>[0]
}) => {
  useEffect(() => () => {
    editor.dispose()
  }, [editor])

  useEffect(() => {
    editor.configure(runtimeConfig)
  }, [editor, runtimeConfig])

  return null
}
