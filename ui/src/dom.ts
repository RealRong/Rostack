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
