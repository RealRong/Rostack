import { listCanvasItemRefs } from '@whiteboard/core/document'
import type {
  CanvasItemRef,
  Document
} from '@whiteboard/core/types'

export const refKey = (ref: CanvasItemRef) => `${ref.kind}:${ref.id}`

export const parseRefKey = (key: string): CanvasItemRef => {
  const [kind, id] = key.split(':')
  return kind === 'edge'
    ? { kind: 'edge', id }
    : { kind: 'node', id }
}

export const sameRef = (
  left: CanvasItemRef,
  right: CanvasItemRef
) => left.kind === right.kind && left.id === right.id

export const sameOrder = (
  left: readonly CanvasItemRef[],
  right: readonly CanvasItemRef[]
) => (
  left.length === right.length
  && left.every((ref, index) => sameRef(ref, right[index]!))
)

export const groupIdOfRef = (
  doc: Pick<Document, 'nodes' | 'edges'>,
  ref: CanvasItemRef
) => (
  ref.kind === 'node'
    ? doc.nodes[ref.id]?.groupId
    : doc.edges[ref.id]?.groupId
)

export const orderedRefs = (
  doc: Pick<Document, 'nodes' | 'edges' | 'order'>,
  target: {
    nodeIds?: readonly string[]
    edgeIds?: readonly string[]
  }
): CanvasItemRef[] => {
  const keys = new Set([
    ...(target.nodeIds ?? []).map((id) => `node:${id}`),
    ...(target.edgeIds ?? []).map((id) => `edge:${id}`)
  ])

  return listCanvasItemRefs(doc)
    .filter((ref) => keys.has(refKey(ref)))
}

export const groupRefs = ({
  doc,
  ids
}: {
  doc: Pick<Document, 'nodes' | 'edges' | 'order' | 'groups'>
  ids: readonly string[]
}): CanvasItemRef[] => {
  const groupIdSet = new Set(ids.filter((id) => Boolean(doc.groups[id])))
  if (!groupIdSet.size) {
    return []
  }

  const refs: CanvasItemRef[] = []
  const seen = new Set<string>()

  for (const ref of listCanvasItemRefs(doc)) {
    const groupId = groupIdOfRef(doc, ref)
    if (!groupId || !groupIdSet.has(groupId)) {
      continue
    }

    const key = refKey(ref)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    refs.push(ref)
  }

  return refs
}
