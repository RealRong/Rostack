import type {
  EdgeId,
  NodeId,
  Point
} from '@whiteboard/core/types'
import { store as sharedStore } from '@shared/core'


export type EditField = 'text' | 'title'
export type EditEmptyBehavior = 'keep' | 'remove' | 'default'
export type EditStatus = 'active' | 'committing'

export type EditCapability = {
  placeholder?: string
  multiline: boolean
  empty: EditEmptyBehavior
  defaultText?: string
}

export type EditCaret =
  | {
      kind: 'end'
    }
  | {
      kind: 'point'
      client: Point
    }

export type EditSnapshot = {
  text: string
}

type EditSessionBase = {
  initial: EditSnapshot
  draft: EditSnapshot
  composing: boolean
  caret: EditCaret
  status: EditStatus
  capabilities: EditCapability
}

export type NodeEditSession = EditSessionBase & {
  kind: 'node'
  nodeId: NodeId
  field: EditField
}

export type EdgeLabelEditSession = EditSessionBase & {
  kind: 'edge-label'
  edgeId: EdgeId
  labelId: string
}

export type EditSession =
  | NodeEditSession
  | EdgeLabelEditSession
  | null

export type EditStore = sharedStore.ValueStore<EditSession>

export type EditMutate = {
  set: (session: NonNullable<EditSession>) => void
  input: (text: string) => void
  caret: (caret: EditCaret) => void
  composing: (composing: boolean) => void
  status: (status: EditStatus) => void
  clear: () => void
}

export type EditState = {
  source: EditStore
  mutate: EditMutate
}

export const createEditState = (): EditState => {
  const state = sharedStore.createNormalizedValue<EditSession>({
    initial: null
  })
  const source = state.store

  return {
    source,
    mutate: {
      set: (session) => {
        state.set(session)
      },
      input: (text) => {
        state.update((current) => {
          if (!current) {
            return current
          }

          return current.draft.text === text
            ? current
            : {
                ...current,
                draft: {
                  ...current.draft,
                  text
                }
              }
        })
      },
      caret: (caret) => {
        state.update((current) => {
          if (!current) {
            return current
          }

          return (
            current.caret.kind === caret.kind
            && (
              caret.kind !== 'point'
              || (
                current.caret.kind === 'point'
                && current.caret.client.x === caret.client.x
                && current.caret.client.y === caret.client.y
              )
            )
          )
            ? current
            : {
                ...current,
                caret
              }
        })
      },
      composing: (composing) => {
        state.update((current) => {
          if (!current) {
            return current
          }

          return current.composing === composing
            ? current
            : {
                ...current,
                composing
              }
        })
      },
      status: (status) => {
        state.update((current) => {
          if (!current) {
            return current
          }

          return current.status === status
            ? current
            : {
                ...current,
                status
              }
        })
      },
      clear: () => {
        if (state.read() === null) {
          return
        }

        state.set(null)
      }
    }
  }
}
