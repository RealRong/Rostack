import { useMemo, type CSSProperties } from 'react'
import { useStoreValue } from '@shared/react'
import { useEditor } from '@whiteboard/react/runtime/hooks'

const EMPTY_STYLE: CSSProperties = {
  backgroundImage: 'none'
}

export const Background = () => {
  const editor = useEditor()
  const background = useStoreValue(editor.scene.stores.document.background)
  const viewport = useStoreValue(editor.scene.ui.state.viewport)
  void background
  void viewport
  const view = editor.scene.viewport.background()

  const style = useMemo<CSSProperties>(() => {
    if (view.type === 'none') {
      return EMPTY_STYLE
    }

    return {
      backgroundImage:
        view.type === 'dot'
          ? `radial-gradient(circle at 1px 1px, ${view.color} 1.2px, transparent 1.3px)`
          : `linear-gradient(to right, ${view.color} 1px, transparent 1px), linear-gradient(to bottom, ${view.color} 1px, transparent 1px)`,
      backgroundSize: `${view.step}px ${view.step}px`,
      backgroundPosition: `calc(50% - ${view.offset.x}px) calc(50% - ${view.offset.y}px)`,
      backgroundRepeat: 'repeat'
    }
  }, [view])

  if (view.type === 'none') {
    return null
  }

  return <div className="wb-canvas-background" style={style} />
}
