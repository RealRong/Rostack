import type {
  MutationDelta,
  MutationFootprint,
  MutationIssue,
  MutationStructuralFact,
} from '../../write'
import {
  EMPTY_DELTA,
  EMPTY_ISSUES,
  EMPTY_OUTPUTS,
  type CompiledEntitySpec,
  type MutationApplyResult,
  type MutationStructureSource,
} from '../contracts'
import {
  buildEntityDelta,
  mergeMutationDeltas,
  normalizeMutationDelta,
} from '../delta'
import {
  applyRootWrites,
  appendTableCreateWrites,
  appendTableDeleteWrites,
  invalidCanonicalOperation,
  prefixRecordWrites,
  readChangedPathsFromWrites,
  readEntityAtPath,
  readEntityIdFromValue,
  readEntitySnapshotPaths,
  readSingletonPath,
  readTableEntityPath,
} from '../entity'
import {
  buildEntityFootprint,
  dedupeFootprints,
} from '../footprint'
import {
  applyStructuralEffectResult,
} from '../structural'
import {
  draft,
} from '@shared/draft'
import type {
  AppliedMutationProgram,
  MutationEntityProgramStep,
  MutationOrderedProgramStep,
  MutationProgram,
  MutationProgramStep,
  MutationTreeProgramStep,
} from './program'

const createMutationProgram = <
  Tag extends string = string
>(
  steps: readonly MutationProgramStep<Tag>[] = EMPTY_OUTPUTS as readonly MutationProgramStep<Tag>[]
): MutationProgram<Tag> => ({
  steps
})

const mergeTagDelta = (
  delta: MutationDelta,
  tags: readonly string[] | undefined
): MutationDelta => {
  if (!tags || tags.length === 0) {
    return delta
  }

  let next = delta
  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index]
    if (!tag) {
      continue
    }
    next = mergeMutationDeltas(next, {
      changes: {
        [tag]: true
      }
    })
  }
  return next
}

const isEntityEffect = (
  effect: MutationProgram['steps'][number]
): effect is MutationEntityProgramStep => (
  effect.type === 'entity.create'
  || effect.type === 'entity.patch'
  || effect.type === 'entity.patchMany'
  || effect.type === 'entity.delete'
)

const isStructuralEffect = (
  effect: MutationProgram['steps'][number]
): effect is MutationOrderedProgramStep | MutationTreeProgramStep => (
  effect.type === 'ordered.insert'
  || effect.type === 'ordered.move'
  || effect.type === 'ordered.splice'
  || effect.type === 'ordered.delete'
  || effect.type === 'ordered.patch'
  || effect.type === 'tree.insert'
  || effect.type === 'tree.move'
  || effect.type === 'tree.delete'
  || effect.type === 'tree.restore'
  || effect.type === 'tree.node.patch'
)

const applyEntityCreateEffect = <
  Doc extends object
>(input: {
  document: Doc
  effect: Extract<MutationEntityProgramStep, { type: 'entity.create' }>
  spec: CompiledEntitySpec
  normalize(doc: Doc): Doc
}): AppliedMutationProgram<Doc> => {
  try {
    const { effect, spec } = input
    const value = effect.value

    if (spec.kind === 'singleton') {
      if (spec.family === 'document') {
        const nextDocument = input.normalize(value as Doc)
        const changedPaths = readEntitySnapshotPaths(spec, nextDocument)
        return {
          document: nextDocument,
          inverse: createMutationProgram([{
            type: 'entity.create',
            entity: {
              table: spec.family,
              id: spec.family
            },
            value: input.document
          }]),
          delta: mergeTagDelta(
            buildEntityDelta(spec, 'create', undefined, changedPaths),
            effect.tags
          ),
          structural: EMPTY_OUTPUTS as readonly MutationStructuralFact[],
          footprint: buildEntityFootprint(spec, 'create', undefined, changedPaths),
          issues: EMPTY_ISSUES,
          historyMode: 'track'
        }
      }

      const rootPath = readSingletonPath(spec)
      const nextDocument = applyRootWrites(input.document, {
        [rootPath]: value
      })
      const changedPaths = readEntitySnapshotPaths(spec, value)
      return {
        document: input.normalize(nextDocument),
        inverse: createMutationProgram([{
          type: 'entity.delete',
          entity: {
            table: spec.family,
            id: spec.family
          }
        }]),
        delta: mergeTagDelta(
          buildEntityDelta(spec, 'create', undefined, changedPaths),
          effect.tags
        ),
        structural: EMPTY_OUTPUTS as readonly MutationStructuralFact[],
        footprint: buildEntityFootprint(spec, 'create', undefined, changedPaths),
        issues: EMPTY_ISSUES,
        historyMode: 'track'
      }
    }

    const id = readEntityIdFromValue(spec.family, value)
    const entityPath = readTableEntityPath(spec, id)
    if (readEntityAtPath(input.document, entityPath) !== undefined) {
      throw new Error(`Mutation operation "${spec.family}.create" found an existing entity "${id}".`)
    }

    const writes: Record<string, unknown> = {
      [entityPath]: value
    }
    appendTableCreateWrites(writes, input.document, spec, id)
    const nextDocument = applyRootWrites(input.document, writes)
    const changedPaths = readEntitySnapshotPaths(spec, value)

    return {
      document: input.normalize(nextDocument),
      inverse: createMutationProgram([{
        type: 'entity.delete',
        entity: {
          table: spec.family,
          id
        }
      }]),
      delta: mergeTagDelta(
        buildEntityDelta(spec, 'create', id, changedPaths),
        effect.tags
      ),
      structural: EMPTY_OUTPUTS as readonly MutationStructuralFact[],
      footprint: buildEntityFootprint(spec, 'create', id, changedPaths),
      issues: EMPTY_ISSUES,
      historyMode: 'track'
    }
  } catch (error) {
    throw error
  }
}

const applyEntityPatchEffect = <
  Doc extends object
>(input: {
  document: Doc
  effect: Extract<MutationEntityProgramStep, { type: 'entity.patch' }>
  spec: CompiledEntitySpec
  normalize(doc: Doc): Doc
}): AppliedMutationProgram<Doc> => {
  const { effect, spec } = input
  const entityId = spec.kind === 'singleton'
    ? undefined
    : effect.entity.id
  const entityPath = spec.kind === 'singleton'
    ? readSingletonPath(spec)
    : readTableEntityPath(spec, effect.entity.id)
  const current = readEntityAtPath(input.document, entityPath)
  if (current === undefined && spec.kind !== 'singleton') {
    throw new Error(`Mutation operation "${spec.family}.patch" cannot find entity "${effect.entity.id}".`)
  }

  const entityWrites = effect.writes
  const changedPaths = readChangedPathsFromWrites(entityWrites)
  if (changedPaths.length === 0) {
    return {
      document: input.document,
      inverse: createMutationProgram(),
      delta: mergeTagDelta(EMPTY_DELTA, effect.tags),
      structural: EMPTY_OUTPUTS as readonly MutationStructuralFact[],
      footprint: [],
      issues: EMPTY_ISSUES,
      historyMode: 'neutral'
    }
  }

  const inverseWrites = draft.record.inverse(current, entityWrites)
  const rootWrites = prefixRecordWrites(entityPath, entityWrites)
  const nextDocument = spec.family === 'document'
    ? input.normalize(draft.record.apply(input.document, entityWrites))
    : input.normalize(applyRootWrites(input.document, rootWrites))

  return {
    document: nextDocument,
    inverse: Object.keys(inverseWrites).length === 0
      ? createMutationProgram()
      : createMutationProgram([{
          type: 'entity.patch',
          entity: {
            table: spec.family,
            id: entityId ?? spec.family
          },
          writes: inverseWrites
        }]),
    delta: mergeTagDelta(
      buildEntityDelta(spec, 'patch', entityId, changedPaths),
      effect.tags
    ),
    structural: EMPTY_OUTPUTS as readonly MutationStructuralFact[],
    footprint: buildEntityFootprint(spec, 'patch', entityId, changedPaths),
    issues: EMPTY_ISSUES,
    historyMode: Object.keys(inverseWrites).length === 0
      ? 'neutral'
      : 'track'
  }
}

const applyEntityDeleteEffect = <
  Doc extends object
>(input: {
  document: Doc
  effect: Extract<MutationEntityProgramStep, { type: 'entity.delete' }>
  spec: CompiledEntitySpec
  normalize(doc: Doc): Doc
}): AppliedMutationProgram<Doc> => {
  const { effect, spec } = input
  if (spec.kind === 'singleton') {
    if (spec.family === 'document') {
      throw new Error('document.delete is not supported.')
    }

    const current = readEntityAtPath(input.document, spec.rootKey)
    if (current === undefined) {
      throw new Error(`Mutation operation "${spec.family}.delete" cannot find current value.`)
    }
    const nextDocument = applyRootWrites(input.document, {
      [spec.rootKey]: undefined
    })
    const changedPaths = readEntitySnapshotPaths(spec, current)
    return {
      document: input.normalize(nextDocument),
      inverse: createMutationProgram([{
        type: 'entity.create',
        entity: {
          table: spec.family,
          id: spec.family
        },
        value: current
      }]),
      delta: mergeTagDelta(
        buildEntityDelta(spec, 'delete', undefined, changedPaths),
        effect.tags
      ),
      structural: EMPTY_OUTPUTS as readonly MutationStructuralFact[],
      footprint: buildEntityFootprint(spec, 'delete', undefined, changedPaths),
      issues: EMPTY_ISSUES,
      historyMode: 'track'
    }
  }

  const id = effect.entity.id
  const entityPath = readTableEntityPath(spec, id)
  const current = readEntityAtPath(input.document, entityPath)
  if (current === undefined) {
    throw new Error(`Mutation operation "${spec.family}.delete" cannot find entity "${id}".`)
  }
  const writes: Record<string, unknown> = {
    [entityPath]: undefined
  }
  appendTableDeleteWrites(writes, input.document, spec, id)
  const nextDocument = applyRootWrites(input.document, writes)
  const changedPaths = readEntitySnapshotPaths(spec, current)

  return {
    document: input.normalize(nextDocument),
    inverse: createMutationProgram([{
      type: 'entity.create',
      entity: {
        table: spec.family,
        id
      },
      value: current
    }]),
    delta: mergeTagDelta(
      buildEntityDelta(spec, 'delete', id, changedPaths),
      effect.tags
    ),
    structural: EMPTY_OUTPUTS as readonly MutationStructuralFact[],
    footprint: buildEntityFootprint(spec, 'delete', id, changedPaths),
    issues: EMPTY_ISSUES,
    historyMode: 'track'
  }
}

const applyEntityEffect = <
  Doc extends object
>(input: {
  document: Doc
  effect: MutationEntityProgramStep
  entities: ReadonlyMap<string, CompiledEntitySpec>
  normalize(doc: Doc): Doc
}): AppliedMutationProgram<Doc> => {
  if (input.effect.type === 'entity.patchMany') {
    let current = input.document
    let delta = mergeTagDelta(EMPTY_DELTA, input.effect.tags)
    const inverseSteps: MutationProgramStep[] = []
    const footprint: MutationFootprint[] = []
    let historyMode: 'track' | 'neutral' = 'neutral'

    for (let index = 0; index < input.effect.updates.length; index += 1) {
      const update = input.effect.updates[index]!
      const applied = applyEntityEffect<Doc>({
        document: current,
        effect: {
          type: 'entity.patch',
          entity: {
            table: input.effect.table,
            id: update.id
          },
          writes: update.writes
        },
        entities: input.entities,
        normalize: input.normalize
      })
      current = applied.document
      delta = mergeMutationDeltas(delta, applied.delta)
      inverseSteps.unshift(...applied.inverse.steps)
      footprint.push(...applied.footprint)
      if (applied.historyMode === 'track') {
        historyMode = 'track'
      }
    }

    return {
      document: current,
      inverse: createMutationProgram(inverseSteps),
      delta,
      structural: EMPTY_OUTPUTS as readonly MutationStructuralFact[],
      footprint: dedupeFootprints(footprint),
      issues: EMPTY_ISSUES,
      historyMode
    }
  }

  const spec = input.entities.get(input.effect.entity.table)
  if (!spec) {
    throw new Error(
      `Unknown mutation entity family "${input.effect.entity.table}".`
    )
  }

  switch (input.effect.type) {
    case 'entity.create':
      return applyEntityCreateEffect({
        document: input.document,
        effect: input.effect,
        spec,
        normalize: input.normalize
      })
    case 'entity.patch':
      return applyEntityPatchEffect({
        document: input.document,
        effect: input.effect,
        spec,
        normalize: input.normalize
      })
    case 'entity.delete':
      return applyEntityDeleteEffect({
        document: input.document,
        effect: input.effect,
        spec,
        normalize: input.normalize
      })
    default:
      throw new Error(`Unsupported entity effect "${(input.effect as { type: string }).type}".`)
  }
}

export const applyMutationProgram = <
  Doc extends object,
  Op extends { type: string },
  Tag extends string = string,
  Code extends string = string
>(input: {
  document: Doc
  program: MutationProgram<Tag>
  entities: ReadonlyMap<string, CompiledEntitySpec>
  structures?: MutationStructureSource<Doc>
  normalize(doc: Doc): Doc
}): MutationApplyResult<Doc, Op, Code> => {
  let currentDocument = input.document
  let delta = EMPTY_DELTA
  const structural: MutationStructuralFact[] = []
  const inverseSteps: MutationProgramStep[] = []
  const footprint: MutationFootprint[] = []
  const issues: MutationIssue[] = []
  let historyMode: 'track' | 'neutral' = 'neutral'

  try {
    for (let index = 0; index < input.program.steps.length; index += 1) {
      const effect = input.program.steps[index]!
      if (effect.type === 'semantic.tag') {
        delta = mergeTagDelta(delta, [effect.value])
        continue
      }
      if (effect.type === 'semantic.change') {
        delta = mergeMutationDeltas(delta, normalizeMutationDelta({
          changes: {
            [effect.key]: effect.change ?? true
          }
        }))
        continue
      }
      if (effect.type === 'semantic.footprint') {
        footprint.push(...effect.footprint)
        continue
      }

      const applied = isEntityEffect(effect)
        ? applyEntityEffect<Doc>({
            document: currentDocument,
            effect,
            entities: input.entities,
            normalize: input.normalize
          })
        : isStructuralEffect(effect)
          ? applyStructuralEffectResult<Doc>({
              document: currentDocument,
              effect,
              structures: input.structures
            })
          : undefined

      if (!applied) {
        continue
      }

      currentDocument = applied.document
      delta = mergeMutationDeltas(
        delta,
        mergeTagDelta(applied.delta, 'tags' in effect ? effect.tags : undefined)
      )
      structural.push(...applied.structural)
      inverseSteps.unshift(...applied.inverse.steps)
      footprint.push(...applied.footprint)
      issues.push(...applied.issues)
      if (applied.historyMode === 'track') {
        historyMode = 'track'
      }
    }

    return {
      ok: true,
      data: {
        document: currentDocument,
        applied: input.program,
        inverse: createMutationProgram(inverseSteps),
        delta,
        structural,
        footprint: dedupeFootprints(footprint),
        outputs: EMPTY_OUTPUTS,
        issues,
        historyMode
      }
    }
  } catch (error) {
    return invalidCanonicalOperation(error)
  }
}
