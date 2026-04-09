import type {
  EdgeId,
  EdgePatch
} from '@whiteboard/core/types'
import type { EditorEdgePatch } from '../../types/editor'

const hasPatchContent = (
  patch: EdgePatch
) => Object.keys(patch).length > 0

export const compileEdgePatch = ({
  edgeIds,
  patch,
  readEdge
}: {
  edgeIds: readonly EdgeId[]
  patch: EditorEdgePatch
  readEdge: (id: EdgeId) => {
    style?: EdgePatch['style']
  } | undefined
}): Array<{
  id: EdgeId
  patch: EdgePatch
}> => edgeIds.flatMap((id) => {
  const edge = readEdge(id)
  if (!edge) {
    return []
  }

  const nextPatch: EdgePatch = {
    ...(patch.fields?.source !== undefined ? { source: patch.fields.source } : {}),
    ...(patch.fields?.target !== undefined ? { target: patch.fields.target } : {}),
    ...(patch.fields?.type !== undefined ? { type: patch.fields.type } : {}),
    ...(patch.fields?.textMode !== undefined ? { textMode: patch.fields.textMode } : {}),
    ...(patch.style
      ? {
          style: {
            ...(edge.style ?? {}),
            ...patch.style
          }
        }
      : {})
  }

  return hasPatchContent(nextPatch)
    ? [{
        id,
        patch: nextPatch
      }]
    : []
})
