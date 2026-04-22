const randomUuid = (): string => {
  const generator = globalThis.crypto?.randomUUID
  if (typeof generator === 'function') {
    return generator.call(globalThis.crypto)
  }

  const now = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2)
  return `${now}_${random}`
}

export const createId = (prefix?: string): string => {
  const id = randomUuid()
  return prefix ? `${prefix}_${id}` : id
}
