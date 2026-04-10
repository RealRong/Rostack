import { DrawPreview } from './DrawPreview'
import { useStoreValue } from '@shared/react'
import { useEditorRuntime } from '#react/runtime/hooks'

export const DrawLayer = () => {
  const editor = useEditorRuntime()
  const chrome = useStoreValue(editor.select.chrome())
  const preview = chrome.draw

  return <DrawPreview preview={preview} />
}
