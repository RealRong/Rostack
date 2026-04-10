import type {
  Edge,
  EdgeId,
  Node,
  NodeId,
  Point,
  Size
} from '@whiteboard/core/types'
import { createValueStore, type ValueStore } from '@shared/store'

export type EditField = 'text' | 'title'
export type EditTool =
  | 'size'
  | 'weight'
  | 'italic'
  | 'color'
  | 'background'
  | 'align'
export type EditEmptyBehavior = 'keep' | 'remove' | 'default'
export type EditMeasureMode = 'none' | 'text'
export type EditStatus = 'active' | 'committing'

export type EditStyleDraft = {
  size?: number
  weight?: number
  italic?: boolean
  color?: string
  background?: string
  align?: 'left' | 'center' | 'right'
}

export type EditCapability = {
  tools: readonly EditTool[]
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
  style?: EditStyleDraft
  measure?: Size
}

type EditSessionBase = {
  initial: EditSnapshot
  draft: EditSnapshot
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
  style: (patch: EditStyleDraft) => void
  measure: (size?: Size) => void
  status: (status: EditStatus) => void
  clear: () => void
}

export type EditState = {
  source: EditStore
  mutate: EditMutate
}

export const createEditState = (): EditState => {
  const source = createValueStore<EditSession>(null)

  const update = (
    recipe: (current: NonNullable<EditSession>) => NonNullable<EditSession>
  ) => {
    const current = source.get()
    if (!current) {
      return
    }

    source.set(recipe(current))
  }

  return {
    source,
    mutate: {
      set: (session) => {
        source.set(session)
      },
      input: (text) => {
        update((current) => (
          current.draft.text === text
            ? current
            : {
                ...current,
                draft: {
                  ...current.draft,
                  text
                }
              }
        ))
      },
      caret: (caret) => {
        update((current) => (
          current.caret.kind === caret.kind
          && (
            caret.kind !== 'point'
            || (
              current.caret.kind === 'point'
              && current.caret.client.x === caret.client.x
              && current.caret.client.y === caret.client.y
            )
          )
            ? current
            : {
                ...current,
                caret
              }
        ))
      },
      style: (patch) => {
        update((current) => {
          const nextStyle = {
            ...(current.draft.style ?? {}),
            ...patch
          }

          return isEditStyleDraftEqual(current.draft.style, nextStyle)
            ? current
            : {
                ...current,
                draft: {
                  ...current.draft,
                  style: nextStyle
                }
              }
        })
      },
      measure: (size) => {
        update((current) => (
          isEditMeasureEqual(current.draft.measure, size)
            ? current
            : {
                ...current,
                draft: {
                  ...current.draft,
                  measure: size
                }
              }
        ))
      },
      status: (status) => {
        update((current) => (
          current.status === status
            ? current
            : {
                ...current,
                status
              }
        ))
      },
      clear: () => {
        if (source.get() === null) {
          return
        }

        source.set(null)
      }
    }
  }
}

export const isEditMeasureEqual = (
  left: Size | undefined,
  right: Size | undefined
) => (
  left?.width === right?.width
  && left?.height === right?.height
)

export const isEditStyleDraftEqual = (
  left: EditStyleDraft | undefined,
  right: EditStyleDraft | undefined
) => (
  left?.size === right?.size
  && left?.weight === right?.weight
  && left?.italic === right?.italic
  && left?.color === right?.color
  && left?.background === right?.background
  && left?.align === right?.align
)

export const readNodeEditStyle = (
  node: Pick<Node, 'style'>
): EditStyleDraft | undefined => {
  const style = {
    size:
      typeof node.style?.fontSize === 'number'
        ? node.style.fontSize
        : undefined,
    weight:
      typeof node.style?.fontWeight === 'number'
        ? node.style.fontWeight
        : undefined,
    italic:
      typeof node.style?.fontStyle === 'string'
        ? node.style.fontStyle === 'italic'
        : undefined,
    color:
      typeof node.style?.color === 'string'
        ? node.style.color
        : undefined,
    background:
      typeof node.style?.fill === 'string'
        ? node.style.fill
        : undefined,
    align:
      node.style?.textAlign === 'left'
      || node.style?.textAlign === 'center'
      || node.style?.textAlign === 'right'
        ? node.style.textAlign
        : undefined
  } satisfies EditStyleDraft

  return isEditStyleDraftEmpty(style)
    ? undefined
    : style
}

export const readEdgeLabelEditStyle = (
  label: NonNullable<Edge['labels']>[number]
): EditStyleDraft | undefined => {
  const style = {
    size: label.style?.size,
    weight: label.style?.weight,
    italic: label.style?.italic,
    color: label.style?.color,
    background: label.style?.bg
  } satisfies EditStyleDraft

  return isEditStyleDraftEmpty(style)
    ? undefined
    : style
}

export const applyNodeEditStyle = (
  current: Node['style'] | undefined,
  draft: EditStyleDraft | undefined
): Node['style'] | undefined => {
  if (!draft) {
    return current
  }

  const next = {
    ...(current ?? {}),
    ...(draft.size !== undefined ? { fontSize: draft.size } : {}),
    ...(draft.weight !== undefined ? { fontWeight: draft.weight } : {}),
    ...(draft.italic !== undefined ? { fontStyle: draft.italic ? 'italic' : 'normal' } : {}),
    ...(draft.color !== undefined ? { color: draft.color } : {}),
    ...(draft.background !== undefined ? { fill: draft.background } : {}),
    ...(draft.align !== undefined ? { textAlign: draft.align } : {})
  }

  return next
}

export const applyEdgeLabelEditStyle = (
  current: NonNullable<Edge['labels']>[number]['style'] | undefined,
  draft: EditStyleDraft | undefined
): NonNullable<Edge['labels']>[number]['style'] | undefined => {
  if (!draft) {
    return current
  }

  return {
    ...(current ?? {}),
    ...(draft.size !== undefined ? { size: draft.size } : {}),
    ...(draft.weight !== undefined ? { weight: draft.weight } : {}),
    ...(draft.italic !== undefined ? { italic: draft.italic } : {}),
    ...(draft.color !== undefined ? { color: draft.color } : {}),
    ...(draft.background !== undefined ? { bg: draft.background } : {})
  }
}

const isEditStyleDraftEmpty = (
  style: EditStyleDraft
) => (
  style.size === undefined
  && style.weight === undefined
  && style.italic === undefined
  && style.color === undefined
  && style.background === undefined
  && style.align === undefined
)
