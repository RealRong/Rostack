import {
  closestTarget,
  interactiveSelector
} from '@shared/dom'
import type { ItemId } from '@dataview/engine'
import type { Box } from '@shared/dom'
import { DATAVIEW_APPEARANCE_ID_ATTR } from '@dataview/react/dom/appearance'

const PAGE_SCROLL_SELECTOR = '[data-page-scroll]'
const MARQUEE_BLOCK_SELECTOR = [
  interactiveSelector,
  `[${DATAVIEW_APPEARANCE_ID_ATTR}]`,
  '[data-table-target]',
  '[data-marquee-block]'
].join(', ')

export interface MarqueeScene {
  hitTest(rect: Box): readonly ItemId[]
}

export interface MarqueeBridgeApi {
  shouldStartMarquee(event: PointerEvent): boolean
  registerScene(scene: MarqueeScene): () => void
  getScene(): MarqueeScene | undefined
  resolveAutoPanRoot(): HTMLElement | null
}

export const shouldStartMarquee = (event: PointerEvent): boolean => (
  Boolean(closestTarget(event.target, PAGE_SCROLL_SELECTOR))
  && !closestTarget(event.target, MARQUEE_BLOCK_SELECTOR)
)

export const resolvePageMarqueeScrollRoot = (): HTMLElement | null => (
  typeof document === 'undefined'
    ? null
    : document.querySelector<HTMLElement>(PAGE_SCROLL_SELECTOR)
)

export const createMarqueeBridgeApi = (): MarqueeBridgeApi => {
  let activeScene: MarqueeScene | undefined

  return {
    shouldStartMarquee,
    registerScene: scene => {
      activeScene = scene
      return () => {
        if (activeScene === scene) {
          activeScene = undefined
        }
      }
    },
    getScene: () => activeScene,
    resolveAutoPanRoot: () => resolvePageMarqueeScrollRoot()
  }
}
