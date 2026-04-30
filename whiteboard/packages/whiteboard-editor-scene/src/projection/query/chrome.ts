import type { SceneOverlay, SceneViewport } from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'

export const createChromeRead = (input: {
  state: () => WorkingState
  view: SceneViewport
}): SceneOverlay => ({
  marquee: () => {
    const marquee = input.state().graph.state.chrome.preview.marquee

    return marquee
      ? {
          rect: input.view.screenRect(marquee.worldRect),
          match: marquee.match
        }
      : undefined
  },
  draw: () => input.state().graph.state.chrome.preview.draw,
  guides: () => input.state().graph.state.chrome.preview.guides,
  edgeGuide: () => input.state().graph.state.chrome.preview.edgeGuide
})
