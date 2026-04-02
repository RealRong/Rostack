import { DrawPreview } from './DrawPreview'
import { useEditorRuntime } from '../../runtime/hooks/useEditor'
import { useStoreValue } from '../../runtime/hooks/useStoreValue'

export const DrawLayer = () => {
  const editor = useEditorRuntime()
  const preview = useStoreValue(editor.read.overlay.feedback.draw)

  return <DrawPreview preview={preview} />
}
