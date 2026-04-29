import { document as documentApi } from '@whiteboard/core/document'
import type { SliceExportResult } from '@whiteboard/core/document'
import type {
  Edge,
  EdgeId,
  Node,
  NodeId
} from '@whiteboard/core/types'
import type { Revision } from '@shared/projection'
import type { WorkingState } from '../../contracts/working'

type ResolverCache = {
  revision: Revision | null
  nodeIds: readonly NodeId[] | null
  edgeIds: readonly EdgeId[] | null
}

export interface DocumentResolver {
  node(id: NodeId): Node | undefined
  edge(id: EdgeId): Edge | undefined
  nodeIds(): readonly NodeId[]
  edgeIds(): readonly EdgeId[]
  slice(input: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }): SliceExportResult | undefined
}

const createCache = (): ResolverCache => ({
  revision: null,
  nodeIds: null,
  edgeIds: null
})

export const createDocumentResolver = (input: {
  state: () => WorkingState
}): DocumentResolver => {
  let cache = createCache()

  const readState = () => input.state()
  const readSnapshot = () => readState().document.snapshot

  const ensureCache = () => {
    const revision = readState().revision.document
    if (cache.revision === revision) {
      return
    }

    cache = createCache()
    cache.revision = revision
  }

  return {
    node: (id) => readSnapshot().nodes[id],
    edge: (id) => readSnapshot().edges[id],
    nodeIds: () => {
      ensureCache()
      if (!cache.nodeIds) {
        cache.nodeIds = Object.keys(readSnapshot().nodes) as readonly NodeId[]
      }
      return cache.nodeIds
    },
    edgeIds: () => {
      ensureCache()
      if (!cache.edgeIds) {
        cache.edgeIds = Object.keys(readSnapshot().edges) as readonly EdgeId[]
      }
      return cache.edgeIds
    },
    slice: ({ nodeIds, edgeIds }) => {
      const exported = documentApi.slice.export.selection({
        doc: readSnapshot(),
        nodeIds,
        edgeIds
      })

      return exported.ok
        ? exported.data
        : undefined
    }
  }
}
