import type {
  View
} from '@dataview/core/contracts'

const suffixPattern = /^(.*?)(?:\s+(\d+))?$/

export const createDuplicateViewPreferredName = (name: string): string => {
  const normalizedName = name.trim()
  return normalizedName ? `${normalizedName} Copy` : ''
}

export const resolveUniqueViewName = (input: {
  views: readonly Pick<View, 'name'>[]
  preferredName: string
}): string => {
  const preferredName = input.preferredName.trim()
  if (!preferredName) {
    return ''
  }

  const existingNames = new Set(
    input.views.map(view => view.name.trim()).filter(Boolean)
  )
  if (!existingNames.has(preferredName)) {
    return preferredName
  }

  const match = suffixPattern.exec(preferredName)
  const baseName = match?.[1]?.trim() || preferredName

  for (let index = 2; index < Number.MAX_SAFE_INTEGER; index += 1) {
    const candidate = `${baseName} ${index}`
    if (!existingNames.has(candidate)) {
      return candidate
    }
  }

  return `${baseName} ${Date.now()}`
}
