import type {
  ReplayPlan,
  SyncCursor,
  YjsSyncSnapshot
} from '@whiteboard/collab/types/internal'

const readChangeIds = (
  snapshot: YjsSyncSnapshot
): readonly string[] => snapshot.changes.map((change) => change.id)

export const createSyncCursor = (
  snapshot: YjsSyncSnapshot
): SyncCursor => ({
  checkpointId: snapshot.checkpoint?.id ?? null,
  changeIds: readChangeIds(snapshot)
})

export const planReplay = ({
  cursor,
  snapshot,
  forceReset = false
}: {
  cursor: SyncCursor
  snapshot: YjsSyncSnapshot
  forceReset?: boolean
}): ReplayPlan => {
  if (forceReset) {
    return {
      kind: 'reset',
      checkpoint: snapshot.checkpoint,
      changes: snapshot.changes
    }
  }

  const nextCheckpointId = snapshot.checkpoint?.id ?? null
  if (nextCheckpointId !== cursor.checkpointId) {
    return {
      kind: 'reset',
      checkpoint: snapshot.checkpoint,
      changes: snapshot.changes
    }
  }

  const nextChangeIds = readChangeIds(snapshot)
  if (cursor.changeIds.length > nextChangeIds.length) {
    return {
      kind: 'reset',
      checkpoint: snapshot.checkpoint,
      changes: snapshot.changes
    }
  }

  for (let index = 0; index < cursor.changeIds.length; index += 1) {
    if (cursor.changeIds[index] !== nextChangeIds[index]) {
      return {
        kind: 'reset',
        checkpoint: snapshot.checkpoint,
        changes: snapshot.changes
      }
    }
  }

  return {
    kind: 'append',
    changes: snapshot.changes.slice(cursor.changeIds.length)
  }
}
