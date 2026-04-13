import { useMemo, type CSSProperties } from 'react'
import { useStoreValue } from '@shared/react'
import { useEditor } from '#whiteboard-react/runtime/hooks'

const BASE_STEP = 24
const MIN_STEP = 14
const EMPTY_STYLE: CSSProperties = {
  backgroundImage: 'none'
}

const resolveStep = (zoom: number) => {
  let step = BASE_STEP * Math.max(zoom, 0.0001)
  while (step < MIN_STEP) {
    step *= 2
  }
  return step
}

export const Background = () => {
  const editor = useEditor()
  const background = useStoreValue(editor.read.document.background)
  const viewport = useStoreValue(editor.store.viewport)
  const mode = background?.type ?? 'none'

  const style = useMemo<CSSProperties>(() => {
    if (mode === 'none') {
      return EMPTY_STYLE
    }

    const step = resolveStep(viewport.zoom)
    const offsetX = viewport.center.x * viewport.zoom
    const offsetY = viewport.center.y * viewport.zoom
    const color = background?.color ?? 'rgb(from var(--ui-text-primary) r g b / 0.08)'

    return {
      backgroundImage:
        mode === 'dot'
          ? `radial-gradient(circle at 1px 1px, ${color} 1.2px, transparent 1.3px)`
          : `linear-gradient(to right, ${color} 1px, transparent 1px), linear-gradient(to bottom, ${color} 1px, transparent 1px)`,
      backgroundSize: `${step}px ${step}px`,
      backgroundPosition: `calc(50% - ${offsetX}px) calc(50% - ${offsetY}px)`,
      backgroundRepeat: 'repeat'
    }
  }, [
    background?.color,
    mode,
    viewport.center.x,
    viewport.center.y,
    viewport.zoom
  ])

  if (mode === 'none') {
    return null
  }

  return <div className="wb-canvas-background" style={style} />
}
