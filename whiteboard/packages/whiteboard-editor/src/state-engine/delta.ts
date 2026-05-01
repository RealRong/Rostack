import {
  normalizeMutationDelta,
  type MutationDelta,
  type MutationDeltaInput
} from '@shared/mutation'

export type EditorStateMutationDelta = MutationDelta & {
  raw: MutationDelta
  tool: {
    changed(): boolean
  }
  draw: {
    changed(): boolean
  }
  selection: {
    changed(): boolean
  }
  edit: {
    changed(): boolean
  }
  interaction: {
    changed(): boolean
  }
  preview: {
    changed(): boolean
  }
  viewport: {
    changed(): boolean
  }
}

const changedKey = (
  delta: MutationDelta,
  key: string
): boolean => (
  delta.reset === true
  || delta.has(key)
  || Object.keys(delta.changes).some((currentKey) => (
    currentKey.startsWith(`${key}.`)
  ))
)

const CACHE = new WeakMap<MutationDelta, EditorStateMutationDelta>()

export const createEditorStateMutationDelta = (
  raw: MutationDelta | MutationDeltaInput
): EditorStateMutationDelta => {
  const normalized = normalizeMutationDelta(raw)
  const cached = CACHE.get(normalized)
  if (cached) {
    return cached
  }

  const delta = Object.assign({}, normalized, {
    raw: normalized,
    tool: {
      changed: () => changedKey(normalized, 'tool.value')
    },
    draw: {
      changed: () => changedKey(normalized, 'draw.value')
    },
    selection: {
      changed: () => changedKey(normalized, 'selection.value')
    },
    edit: {
      changed: () => changedKey(normalized, 'edit.value')
    },
    interaction: {
      changed: () => changedKey(normalized, 'interaction.value')
    },
    preview: {
      changed: () => changedKey(normalized, 'preview.value')
    },
    viewport: {
      changed: () => changedKey(normalized, 'viewport.value')
    }
  }) as EditorStateMutationDelta

  CACHE.set(normalized, delta)
  return delta
}
