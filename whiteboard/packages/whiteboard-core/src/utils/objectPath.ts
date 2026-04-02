export const getValueByPath = (value: unknown, path: string): unknown => {
  if (!path) return value
  const parts = path.split('.').filter(Boolean)
  let current: any = value
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = current[part]
  }
  return current
}

export const hasValueByPath = (value: unknown, path: string): boolean => {
  return getValueByPath(value, path) !== undefined
}

export const setValueByPath = (value: unknown, path: string, next: unknown) => {
  if (!path) return
  const parts = path.split('.').filter(Boolean)
  if (parts.length === 0) return
  let current: any = value
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]
    if (current[part] == null || typeof current[part] !== 'object') {
      current[part] = {}
    }
    current = current[part]
  }
  current[parts[parts.length - 1]] = next
}
