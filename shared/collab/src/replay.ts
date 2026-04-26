export interface CollabSnapshot<
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  }
> {
  checkpoint: Checkpoint | null
  changes: readonly Change[]
  duplicateChangeIds?: readonly string[]
}

export interface SyncCursor {
  checkpointId: string | null
  changeIds: readonly string[]
}

export type ReplayPlan<
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  }
> =
  | {
      kind: 'append'
      changes: readonly Change[]
    }
  | {
      kind: 'reset'
      checkpoint: Checkpoint | null
      changes: readonly Change[]
    }

const normalizeChanges = <
  Change extends {
    id: string
  }
>(
  changes: readonly Change[]
) => {
  const seen = new Set<string>()
  const duplicateIds = new Set<string>()
  const unique: Change[] = []

  changes.forEach((change) => {
    if (seen.has(change.id)) {
      duplicateIds.add(change.id)
      return
    }
    seen.add(change.id)
    unique.push(change)
  })

  return {
    changes: unique,
    duplicateChangeIds: [...duplicateIds]
  }
}

export const normalizeSnapshot = <
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  }
>(
  snapshot: CollabSnapshot<Change, Checkpoint>
): CollabSnapshot<Change, Checkpoint> => {
  const normalized = normalizeChanges(snapshot.changes)

  return {
    checkpoint: snapshot.checkpoint,
    changes: normalized.changes,
    duplicateChangeIds: [
      ...(snapshot.duplicateChangeIds ?? []),
      ...normalized.duplicateChangeIds
    ]
  }
}

export const createSyncCursor = <
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  }
>(
  snapshot: CollabSnapshot<Change, Checkpoint>
): SyncCursor => {
  const normalized = normalizeSnapshot(snapshot)

  return {
    checkpointId: normalized.checkpoint?.id ?? null,
    changeIds: normalized.changes.map((change) => change.id)
  }
}

export const planReplay = <
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  }
>(input: {
  cursor: SyncCursor
  snapshot: CollabSnapshot<Change, Checkpoint>
  forceReset?: boolean
}): ReplayPlan<Change, Checkpoint> => {
  const snapshot = normalizeSnapshot(input.snapshot)

  if (input.forceReset) {
    return {
      kind: 'reset',
      checkpoint: snapshot.checkpoint,
      changes: snapshot.changes
    }
  }

  const nextCheckpointId = snapshot.checkpoint?.id ?? null
  if (nextCheckpointId !== input.cursor.checkpointId) {
    return {
      kind: 'reset',
      checkpoint: snapshot.checkpoint,
      changes: snapshot.changes
    }
  }

  const nextChangeIds = snapshot.changes.map((change) => change.id)
  if (input.cursor.changeIds.length > nextChangeIds.length) {
    return {
      kind: 'reset',
      checkpoint: snapshot.checkpoint,
      changes: snapshot.changes
    }
  }

  for (let index = 0; index < input.cursor.changeIds.length; index += 1) {
    if (input.cursor.changeIds[index] !== nextChangeIds[index]) {
      return {
        kind: 'reset',
        checkpoint: snapshot.checkpoint,
        changes: snapshot.changes
      }
    }
  }

  return {
    kind: 'append',
    changes: snapshot.changes.slice(input.cursor.changeIds.length)
  }
}
