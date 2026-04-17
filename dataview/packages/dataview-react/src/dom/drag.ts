import { DATAVIEW_APPEARANCE_ID_ATTR } from '@dataview/react/dom/appearance'

const DEFAULT_SCRUB_SELECTORS = [
  '[data-drag-clone-hidden]'
] as const

const scrubClone = (
  root: HTMLElement,
  scrubSelectors: readonly string[]
) => {
  root.removeAttribute(DATAVIEW_APPEARANCE_ID_ATTR)
  root.removeAttribute('id')
  root.querySelectorAll(`[${DATAVIEW_APPEARANCE_ID_ATTR}]`).forEach(node => {
    node.removeAttribute(DATAVIEW_APPEARANCE_ID_ATTR)
  })
  root.querySelectorAll('[id]').forEach(node => {
    node.removeAttribute('id')
  })
  scrubSelectors.forEach(selector => {
    root.querySelectorAll(selector).forEach(node => {
      node.remove()
    })
  })
}

export const cloneDragNode = (
  source: HTMLElement | null,
  input?: {
    size?: {
      width: number
      height: number
    }
    scrubSelectors?: readonly string[]
  }
): HTMLElement | null => {
  if (!source) {
    return null
  }

  const rect = source.getBoundingClientRect()
  const clone = source.cloneNode(true) as HTMLElement
  const scrubSelectors = [
    ...DEFAULT_SCRUB_SELECTORS,
    ...(input?.scrubSelectors ?? [])
  ]

  scrubClone(clone, scrubSelectors)
  clone.style.width = `${Math.round(input?.size?.width ?? rect.width)}px`
  clone.style.height = `${Math.round(input?.size?.height ?? rect.height)}px`
  clone.style.margin = '0'
  clone.style.pointerEvents = 'none'
  clone.style.transform = 'none'
  clone.style.transition = 'none'
  clone.style.animation = 'none'

  return clone
}
