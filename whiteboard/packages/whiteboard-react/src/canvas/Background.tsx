import {
  useLayoutEffect,
  useRef,
  type CSSProperties
} from 'react'
import { useEditor } from '@whiteboard/react/runtime/hooks'

type BackgroundView = ReturnType<ReturnType<typeof useEditor>['scene']['ui']['background']['get']>

const applyBackgroundStyle = (
  element: HTMLDivElement,
  view: BackgroundView
) => {
  if (view.type === 'none') {
    element.style.display = 'none'
    element.style.backgroundImage = 'none'
    element.style.backgroundSize = ''
    element.style.backgroundPosition = ''
    element.style.backgroundRepeat = ''
    return
  }

  element.style.display = ''
  element.style.backgroundImage = view.type === 'dot'
    ? `radial-gradient(circle at 1px 1px, ${view.color} 1.2px, transparent 1.3px)`
    : `linear-gradient(to right, ${view.color} 1px, transparent 1px), linear-gradient(to bottom, ${view.color} 1px, transparent 1px)`
  element.style.backgroundSize = `${view.step}px ${view.step}px`
  element.style.backgroundPosition = `calc(50% - ${view.offset.x}px) calc(50% - ${view.offset.y}px)`
  element.style.backgroundRepeat = 'repeat'
}

const toInitialStyle = (view: BackgroundView): CSSProperties => {
  if (view.type === 'none') {
    return {
      display: 'none',
      backgroundImage: 'none'
    }
  }

  return {
    backgroundImage: view.type === 'dot'
      ? `radial-gradient(circle at 1px 1px, ${view.color} 1.2px, transparent 1.3px)`
      : `linear-gradient(to right, ${view.color} 1px, transparent 1px), linear-gradient(to bottom, ${view.color} 1px, transparent 1px)`,
    backgroundSize: `${view.step}px ${view.step}px`,
    backgroundPosition: `calc(50% - ${view.offset.x}px) calc(50% - ${view.offset.y}px)`,
    backgroundRepeat: 'repeat'
  }
}

export const Background = () => {
  const editor = useEditor()
  const backgroundRef = useRef<HTMLDivElement | null>(null)
  const initialStyle = toInitialStyle(editor.scene.ui.background.get())

  useLayoutEffect(() => {
    const applyBackground = () => {
      if (!backgroundRef.current) {
        return
      }

      applyBackgroundStyle(backgroundRef.current, editor.scene.ui.background.get())
    }

    applyBackground()

    return editor.scene.ui.background.subscribe(applyBackground)
  }, [editor])

  return (
    <div
      ref={backgroundRef}
      className="wb-canvas-background"
      style={initialStyle}
    />
  )
}
