import type {
  EdgeId,
  NodeId,
  Point,
  Rect,
  Size
} from '@whiteboard/core/types'
import type { ValueStore } from '@shared/core'
import { createCommandState } from '@whiteboard/editor/local/session/store'

export type EditField = 'text' | 'title'
export type EditEmptyBehavior = 'keep' | 'remove' | 'default'
export type EditMeasureMode = 'none' | 'text'
export type EditStatus = 'active' | 'committing'

export type EditCapability = {
  placeholder?: string
  multiline: boolean
  empty: EditEmptyBehavior
  measure: EditMeasureMode
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

export type EditLayout = {
  baseRect?: Rect
  measuredSize?: Size
  wrapWidth?: number
  composing: boolean
}

type EditSessionBase = {
  initial: EditSnapshot
  draft: EditSnapshot
  layout: EditLayout
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

export type EditStore = ValueStore<EditSession>

export type EditMutate = {
  set: (session: NonNullable<EditSession>) => void
  input: (text: string) => void
  caret: (caret: EditCaret) => void
  measure: (patch: Partial<EditLayout>) => void
  status: (status: EditStatus) => void
  clear: () => void
}

export type EditState = {
  source: EditStore
  mutate: EditMutate
}

export const createEditState = (): EditState => {
  const state = createCommandState<EditSession>({
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
      measure: (patch) => {
        state.update((current) => {
          if (!current) {
            return current
          }

          const nextLayout = {
            ...current.layout,
            ...patch
          }

          return isEditLayoutEqual(current.layout, nextLayout)
            ? current
            : {
                ...current,
                layout: nextLayout
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

export const isEditRectEqual = (
  left: Rect | undefined,
  right: Rect | undefined
) => (
  left?.x === right?.x
  && left?.y === right?.y
  && left?.width === right?.width
  && left?.height === right?.height
)

export const isEditMeasureEqual = (
  left: Size | undefined,
  right: Size | undefined
) => (
  left?.width === right?.width
  && left?.height === right?.height
)

export const isEditLayoutEqual = (
  left: EditLayout,
  right: EditLayout
) => (
  isEditRectEqual(left.baseRect, right.baseRect)
  && isEditMeasureEqual(left.measuredSize, right.measuredSize)
  && left.wrapWidth === right.wrapWidth
  && left.composing === right.composing
)
