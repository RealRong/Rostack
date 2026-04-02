export const focusWithoutScroll = (
  element: HTMLElement | null | undefined
) => {
  element?.focus({
    preventScroll: true
  })
}

export const focusInputWithoutScroll = (
  element: HTMLInputElement | null | undefined,
  options?: {
    select?: boolean
  }
) => {
  if (!element) {
    return
  }

  element.focus({
    preventScroll: true
  })

  if (options?.select) {
    element.select()
  }
}
