import { useStoreValue } from '@shared/react'
import { useEditorRuntime } from '#react/runtime/hooks'

export const Marquee = () => {
  const editor = useEditorRuntime()
  const chrome = useStoreValue(editor.select.chrome())
  const marquee = chrome.marquee

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
