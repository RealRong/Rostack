import { DrawPreview } from './DrawPreview'
import { useStoreValue } from '@shared/react'
import { useEditorRuntime } from '#react/runtime/hooks'

export const DrawLayer = () => {
  const editor = useEditorRuntime()
  const preview = useStoreValue(editor.read.overlay.feedback.draw)

  return <DrawPreview preview={preview} />
}
