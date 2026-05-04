import {
  getCompiledMutationSchema,
  type MutationEntityTarget,
  type MutationSchema,
  type MutationWrite,
} from '@shared/mutation'

export type HistoryScope =
  | {
      kind: 'entity'
      schemaPath: readonly string[]
      targetPath: readonly string[]
    }
  | {
      kind: 'node'
      schemaPath: readonly string[]
      targetPath: readonly string[]
    }

const EMPTY_TARGET_PATH: readonly string[] = []

const toTargetPath = (
  target?: MutationEntityTarget
): readonly string[] => target
  ? [...target.scope, target.id]
  : EMPTY_TARGET_PATH

const isPrefixPath = (
  prefix: readonly string[],
  value: readonly string[]
): boolean => (
  prefix.length <= value.length
  && prefix.every((part, index) => value[index] === part)
)

const isSamePath = (
  left: readonly string[],
  right: readonly string[]
): boolean => (
  left.length === right.length
  && left.every((part, index) => right[index] === part)
)

const isEntityWrite = (write: MutationWrite): boolean => (
  write.kind === 'entity.create'
  || write.kind === 'entity.remove'
  || write.kind === 'entity.move'
)

const serializeScopeKey = (scope: HistoryScope): string => JSON.stringify([
  scope.kind,
  scope.schemaPath,
  scope.targetPath
])

export const createHistoryScopes = <TSchema extends MutationSchema>(
  schema: TSchema,
  writes: readonly MutationWrite[]
): readonly HistoryScope[] => {
  const compiled = getCompiledMutationSchema(schema)
  const result: HistoryScope[] = []
  const seen = new Set<string>()

  writes.forEach((write) => {
    const node = compiled.nodes[write.nodeId]
    if (!node) {
      throw new Error(`Unknown compiled mutation node ${write.nodeId}.`)
    }

    const scope: HistoryScope = {
      kind: isEntityWrite(write)
        ? 'entity'
        : 'node',
      schemaPath: node.path,
      targetPath: toTargetPath(write.target)
    }
    const key = serializeScopeKey(scope)
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    result.push(scope)
  })

  return result
}

export const historyScopesIntersect = (
  left: HistoryScope,
  right: HistoryScope
): boolean => {
  if (left.kind === 'entity') {
    return isPrefixPath(left.schemaPath, right.schemaPath)
      && isPrefixPath(left.targetPath, right.targetPath)
  }

  if (right.kind === 'entity') {
    return isPrefixPath(right.schemaPath, left.schemaPath)
      && isPrefixPath(right.targetPath, left.targetPath)
  }

  return isSamePath(left.schemaPath, right.schemaPath)
    && isSamePath(left.targetPath, right.targetPath)
}
