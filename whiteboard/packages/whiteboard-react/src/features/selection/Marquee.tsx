import { useStoreValue } from '@shared/react'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'

export const Marquee = () => {
  const editor = useEditorRuntime()
  const marquee = useStoreValue(editor.scene.ui.chrome.selection.marquee)

  if (!marquee) return null

  return (
    <div
      className="wb-marquee-layer"
      data-match={marquee.match}
      style={{
        transform: `translate(${marquee.rect.x}px, ${marquee.rect.y}px)`,
        width: marquee.rect.width,
        height: marquee.rect.height
      }}
    />
  )
}
