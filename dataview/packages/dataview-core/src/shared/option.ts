export const normalizeOptionIdList = (
  optionIds: readonly unknown[]
): string[] => {
  const seen = new Set<string>()
  const next: string[] = []

  optionIds.forEach(optionId => {
    if (typeof optionId !== 'string') {
      return
    }

    const normalized = optionId.trim()
    if (!normalized || seen.has(normalized)) {
      return
    }

    seen.add(normalized)
    next.push(normalized)
  })

  return next
}

export const normalizeOptionIds = (
  value: unknown
): string[] => (
  Array.isArray(value)
    ? normalizeOptionIdList(value)
    : []
)
