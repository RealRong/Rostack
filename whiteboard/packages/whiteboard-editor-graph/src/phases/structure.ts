import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type { EditorPhase } from './shared'
import { toMetric } from './shared'

export const createStructurePhase = (): EditorPhase => ({
  name: 'structure',
  deps: ['graph'],
  run: (context) => {
    const mindmaps = new Map()
    const groups = new Map()

    context.working.graph.owners.mindmaps.forEach((entry, mindmapId) => {
      mindmaps.set(mindmapId, {
        nodeIds: entry.nodeIds,
        tree: mindmapApi.tree.fromRecord(entry.base.mindmap)
      })
    })

    context.working.graph.owners.groups.forEach((entry, groupId) => {
      groups.set(groupId, {
        itemIds: entry.items
      })
    })

    context.working.structure = {
      mindmaps,
      groups
    }

    return {
      action: 'sync',
      change: undefined,
      metrics: toMetric(mindmaps.size + groups.size)
    }
  }
})
