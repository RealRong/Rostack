import { DrawPreview } from './DrawPreview'
import { useEditorRuntime } from '#react/runtime/hooks'
import { useStoreValue } from '#react/runtime/hooks'

export const DrawLayer = () => {
  const editor = useEditorRuntime()
  const preview = useStoreValue(editor.read.overlay.feedback.draw)

  return <DrawPreview preview={preview} />
}
