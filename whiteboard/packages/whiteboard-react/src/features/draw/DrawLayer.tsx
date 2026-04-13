import { DrawPreview } from '#whiteboard-react/features/draw/DrawPreview'
import { useStoreValue } from '@shared/react'
import { useEditorRuntime } from '#whiteboard-react/runtime/hooks'

export const DrawLayer = () => {
  const editor = useEditorRuntime()
  const chrome = useStoreValue(editor.read.chrome)
  const preview = chrome.draw

  return <DrawPreview preview={preview} />
}
