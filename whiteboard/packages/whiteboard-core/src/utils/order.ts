export const sanitizeOrderIds = <T extends string>(ids: T[]) =>
  Array.from(new Set(ids))

export const bringOrderToFront = <T extends string>(order: T[], ids: T[]) => {
  const set = new Set(ids)
  const kept = order.filter((id) => !set.has(id))
  const moved = order.filter((id) => set.has(id))
  return [...kept, ...moved]
}

export const sendOrderToBack = <T extends string>(order: T[], ids: T[]) => {
  const set = new Set(ids)
  const kept = order.filter((id) => !set.has(id))
  const moved = order.filter((id) => set.has(id))
  return [...moved, ...kept]
}

export const bringOrderForward = <T extends string>(order: T[], ids: T[]) => {
  const set = new Set(ids)
  const next = [...order]
  for (let index = next.length - 2; index >= 0; index -= 1) {
    const current = next[index]
    const after = next[index + 1]
    if (set.has(current) && !set.has(after)) {
      next[index] = after
      next[index + 1] = current
    }
  }
  return next
}

export const sendOrderBackward = <T extends string>(order: T[], ids: T[]) => {
  const set = new Set(ids)
  const next = [...order]
  for (let index = 1; index < next.length; index += 1) {
    const current = next[index]
    const before = next[index - 1]
    if (set.has(current) && !set.has(before)) {
      next[index - 1] = current
      next[index] = before
    }
  }
  return next
}
