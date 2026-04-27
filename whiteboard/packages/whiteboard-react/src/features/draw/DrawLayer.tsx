import {
  memo
} from 'react'
import { DrawPreview } from '@whiteboard/react/features/draw/DrawPreview'
import { useStoreValue } from '@shared/react'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'

export const DrawLayer = memo(() => {
  const editor = useEditorRuntime()
  const preview = useStoreValue(editor.derived.scene.chrome.draw)

  return <DrawPreview preview={preview} />
})

DrawLayer.displayName = 'DrawLayer'
