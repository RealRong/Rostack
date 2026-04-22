import type { ViewFieldRef } from '@dataview/engine'
import { store } from '@shared/core'
import {
  createNullableControllerStore
} from '@dataview/runtime/session/controller'

export type { ViewFieldRef } from '@dataview/engine'

export type EditorSubmitTrigger =
  | 'enter'
  | 'tab-next'
  | 'tab-previous'
  | 'outside'
  | 'programmatic'

export interface ValueEditorAnchor {
  x: number
  y: number
  width: number
}

export interface CloseValueEditorOptions {
  silent?: boolean
}

export type ValueEditorCloseAction =
  | {
      kind: 'focus-owner'
    }
  | {
      kind: 'move-next-item'
    }
  | {
      kind: 'move-next-field'
    }
  | {
      kind: 'move-previous-field'
    }

export interface ValueEditorSessionPolicy {
  resolveOnCommit: (trigger: EditorSubmitTrigger) => ValueEditorCloseAction
  applyCloseAction: (action: ValueEditorCloseAction) => boolean
  onCancel?: () => void
  onDismiss?: () => void
}

export type ValueEditorResult =
  | {
      kind: 'commit'
      trigger: EditorSubmitTrigger
    }
  | {
      kind: 'cancel'
    }
  | {
      kind: 'dismiss'
    }

export interface OpenValueEditorInput {
  field: ViewFieldRef
  anchor: ValueEditorAnchor
  policy: ValueEditorSessionPolicy
  seedDraft?: string
  onResolve?: (result: ValueEditorResult) => void
}

export interface ValueEditorApi {
  open(input: OpenValueEditorInput): boolean
  close(options?: CloseValueEditorOptions): void
}

export interface ValueEditorController extends ValueEditorApi {
  store: store.ValueStore<OpenValueEditorInput | null>
  openStore: store.ReadStore<boolean>
}

const cloneField = (
  field: ViewFieldRef
): ViewFieldRef => ({
  ...field
})

const normalizeAnchor = (
  anchor: ValueEditorAnchor
): ValueEditorAnchor => ({
  x: Number.isFinite(anchor.x)
    ? Math.round(anchor.x)
    : 0,
  y: Number.isFinite(anchor.y)
    ? Math.round(anchor.y)
    : 0,
  width: Number.isFinite(anchor.width)
    ? Math.max(0, Math.round(anchor.width))
    : 0
})

const createSession = (
  input: OpenValueEditorInput
): OpenValueEditorInput => ({
  field: cloneField(input.field),
  anchor: normalizeAnchor(input.anchor),
  policy: input.policy,
  ...(input.seedDraft !== undefined
    ? {
        seedDraft: input.seedDraft
      }
    : {}),
  ...(input.onResolve
    ? {
        onResolve: input.onResolve
      }
    : {})
})

const dismissSession = (
  store: ValueEditorController['store'],
  options?: {
    result?: ValueEditorResult
    silent?: boolean
  }
) => {
  const current = store.get()
  if (!current) {
    return
  }

  store.set(null)
  if (options?.silent) {
    return
  }

  current.policy.onDismiss?.()
  current.onResolve?.(options?.result ?? {
    kind: 'dismiss'
  })
}

export const createValueEditorApi = (): ValueEditorController => {
  const {
    store: stateStore,
    openStore
  } = createNullableControllerStore<OpenValueEditorInput>()

  return {
    store: stateStore,
    openStore,
    open: input => {
      dismissSession(stateStore)
      stateStore.set(createSession(input))
      return true
    },
    close: options => {
      dismissSession(stateStore, {
        silent: options?.silent
      })
    }
  }
}
