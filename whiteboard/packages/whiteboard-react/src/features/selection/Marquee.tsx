import { useEditorRuntime } from '../../runtime/hooks/useEditor'
import { useStoreValue } from '../../runtime/hooks/useStoreValue'

export const Marquee = () => {
  const editor = useEditorRuntime()
  const marquee = useStoreValue(editor.read.overlay.feedback.marquee)

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
