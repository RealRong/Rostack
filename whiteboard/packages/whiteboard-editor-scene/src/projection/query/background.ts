import type {
  SceneBackgroundView,
  SceneViewSnapshot
} from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'

const BASE_BACKGROUND_STEP = 24
const MIN_BACKGROUND_STEP = 14
const DEFAULT_BACKGROUND_COLOR = 'rgb(from var(--ui-text-primary) r g b / 0.08)'

const resolveBackgroundStep = (zoom: number) => {
  let step = BASE_BACKGROUND_STEP * Math.max(zoom, 0.0001)
  while (step < MIN_BACKGROUND_STEP) {
    step *= 2
  }
  return step
}

export const readBackgroundView = (input: {
  state: WorkingState
  view: SceneViewSnapshot
}): SceneBackgroundView => {
  const background = input.state.document.background
  const type = background?.type ?? 'none'

  if (type === 'none') {
    return {
      type: 'none'
    }
  }

  return {
    type,
    color: background?.color ?? DEFAULT_BACKGROUND_COLOR,
    step: resolveBackgroundStep(input.view.zoom),
    offset: {
      x: input.view.center.x * input.view.zoom,
      y: input.view.center.y * input.view.zoom
    }
  }
}
