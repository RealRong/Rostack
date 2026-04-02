export const BLOCKING_SURFACE_ATTR = 'data-ui-blocking-surface'
export const BLOCKING_SURFACE_BACKDROP_ATTR = 'data-ui-blocking-surface-backdrop'

export const isBlockingSurfaceElement = (element: Element | null) => (
  Boolean(element?.closest(`[${BLOCKING_SURFACE_ATTR}]`))
)
