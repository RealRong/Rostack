export const createReadRecordApi = () => ({
  path: (root: unknown, path: string): unknown => {
    if (!path) {
      return root
    }
    return path.split('.').reduce<unknown>((value, key) => (
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)[key]
        : undefined
    ), root)
  }
})
