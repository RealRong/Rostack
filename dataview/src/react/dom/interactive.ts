export const interactiveSelector = [
  'input',
  'textarea',
  'select',
  'button',
  'a',
  '[contenteditable="true"]',
  '[role="button"]'
].join(', ')

export const targetElement = (
  target: EventTarget | null
): Element | null => {
  if (target instanceof Element) {
    return target
  }

  return target instanceof Node
    ? target.parentElement
    : null
}

export const closestTarget = <T extends Element = Element>(
  target: EventTarget | null,
  selector: string
): T | null => (
  targetElement(target)?.closest<T>(selector) ?? null
)

export const hasInteractiveTarget = (
  target: EventTarget | null,
  currentTarget: HTMLElement
) => {
  const interactive = closestTarget(target, interactiveSelector)
  return Boolean(interactive && currentTarget.contains(interactive))
}

export const shouldCapturePointer = (
  target: EventTarget | null,
  currentTarget: HTMLElement
) => !hasInteractiveTarget(target, currentTarget)

export const containsRelatedTarget = (input: {
  currentTarget: EventTarget | null
  relatedTarget: EventTarget | null
}) => (
  input.currentTarget instanceof Node
  && input.relatedTarget instanceof Node
  && input.currentTarget.contains(input.relatedTarget)
)
