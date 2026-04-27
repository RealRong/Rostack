# Shared / Dataview / Whiteboard 最终 API 设计与实施方案

## 1. 目标

这份文档定义最终状态。

目标只有一个：

1. `shared`
2. `dataview`
3. `whiteboard`

三条线统一到同一套长期最优模型，并且不保留任何过渡层、兼容层、别名层、中间 helper 层。

最终约束：

1. 公共配置层只使用 plain object spec。
2. 公共配置键只使用字符串。
3. 行为函数只留在叶子。
4. 公共实体族统一为 `ids + byId`。
5. 所有注册式、builder 式、helper 装配式 API 直接删除。

---

## 2. 命名规则

最终命名只允许下面这套规则。

### 2.1 配置对象

1. 类型名统一使用 `*Spec`
2. 值名统一使用 `*Spec`
3. 运行时工厂统一使用 `create*Runtime`、`create*Engine`、`createEditor`
4. spec 编译阶段只允许存在于工厂内部或模块内部，不暴露 `compileXXXSpec`

示例：

```ts
type NodeSpec = ...

const nodeSpec = { ... }

const runtime = createProjectionRuntime(projectionSpec)
const editor = createEditor({
  spec: whiteboardSpec,
  document
})
```

### 2.2 公共叶子词汇

最终公共叶子词汇只有：

1. `value`
2. `family`
3. `flag`
4. `ids`
5. `set`

以下词汇直接退出公共 API：

1. `slot`
2. `order` 作为公共顺序字段名
3. `register`
4. `defineXxx`
5. `createXxxSpec`
6. `getXxxSpec`

### 2.3 公共键命名

最终公共键命名只保留下面这些：

1. `type`
2. `family`
3. `fieldKey`
4. `targetKey`
5. `itemKey`
6. `panelKey`
7. `phase`

---

## 3. 统一公共模型

### 3.1 字段键

所有公共字段路径统一为字符串键：

```ts
type FieldKey = `${'data' | 'style'}.${string}`
```

规则：

1. 对外只暴露 `FieldKey`
2. 不再暴露 `Path[]`
3. `Path[]` 只允许存在于 compiler / runtime 内部

### 3.2 目标键

所有 mutation / trace / cache / conflict 目标键统一为字符串 grammar：

```ts
type TargetKey = string
```

规则：

1. 公共层只暴露字符串 grammar
2. 公共层不暴露 `path.of(...)`
3. 公共层不暴露 `path.toString(...)`

### 3.3 实体族

所有公共实体族统一为：

```ts
type EntityFamily<TId extends string, TValue> = {
  ids: readonly TId[]
  byId: Readonly<Record<TId, TValue>> | ReadonlyMap<TId, TValue>
}
```

规则：

1. document / immutable 数据使用 `Record`
2. runtime / hot path 数据可使用 `Map`
3. 公共字段名永远是 `ids` 和 `byId`

---

## 4. Shared 最终 API

### 4.0 shared 暴露原则

最终 shared 暴露面必须遵守下面四条硬规则：

1. root export 只允许暴露稳定的领域原语和顶层工厂。
2. walker、index builder、compiler、publish helper、sync helper 这类机械能力默认 internal-only。
3. 能靠字面量推导的类型不单独暴露。
4. subpath export 默认禁止，只有确实无法避免的 internal 基础设施才允许保留 `./internal`。

最终 root export 收口到下面这组最小表面：

1. `@shared/spec`：`walkSpec`、`createTableIndex`、`createOneToOneIndex`、`createOneToManyIndex`、`splitDotKey`、`joinDotKey`
2. `@shared/delta`：`change`
3. `@shared/projection`：`createProjectionRuntime`
4. `@shared/mutation`：`createMutationEngine`、`createHistoryPort`

例外：

1. `@shared/core` 暂不做 root export 收口。
2. 这轮不删除 `@shared/core` 现有聚合导出。
3. 这轮只要求 `dataview`、`whiteboard`、新的 shared 基础设施不继续扩大对旧 `@shared/core` 聚合面的依赖。

下面这些能力不为 public surface 单独导出：

1. 为了类型补全存在的命名 type
2. scope / plan / sync / runtime 上下文类型
3. compile / index / publish / trace / sync helper
4. builder / define / register 风格 helper
5. plain object spec 和字符串 grammar 已经能表达的 companion API

## 4.1 `@shared/spec`

`@shared/spec` 是 public shared package。

它的 root export 只暴露最小机械 API，不承担业务语义。

最终 root public API：

```ts
export type SpecLeaf = string

export type SpecTree = {
  [key: string]: SpecLeaf | SpecTree
}

export interface SpecVisitor {
  enter?(path: readonly string[], node: SpecTree): void
  leaf(path: readonly string[], kind: SpecLeaf): void
  leave?(path: readonly string[], node: SpecTree): void
}

export const walkSpec: (
  spec: SpecTree,
  visitor: SpecVisitor
) => void

export const createTableIndex: <
  TTable extends Record<string, unknown>,
  TFallback = never
>(
  table: TTable,
  options?: {
    fallback?: (key: string) => TFallback
  }
) => {
  keys: readonly (keyof TTable & string)[]
  values: readonly TTable[keyof TTable & string][]
  entries: readonly (readonly [
    keyof TTable & string,
    TTable[keyof TTable & string]
  ])[]
  has(key: string): key is keyof TTable & string
  get<TKey extends keyof TTable & string>(key: TKey): TTable[TKey]
  resolve(
    key: string
  ): TTable[keyof TTable & string] | TFallback
}

export const createOneToOneIndex: <
  TTable extends Record<string, unknown>,
  TRef extends string
>(
  table: TTable,
  select: (entry: {
    key: keyof TTable & string
    value: TTable[keyof TTable & string]
  }) => TRef | null | undefined
) => Readonly<Record<TRef, keyof TTable & string>>

export const createOneToManyIndex: <
  TTable extends Record<string, unknown>,
  TRef extends string
>(
  table: TTable,
  select: (entry: {
    key: keyof TTable & string
    value: TTable[keyof TTable & string]
  }) => TRef | readonly TRef[] | null | undefined
) => Readonly<Record<TRef, readonly (keyof TTable & string)[]>>

export const splitDotKey: (
  key: string
) => readonly string[]

export const joinDotKey: (
  parts: readonly string[]
) => string
```

规则：

1. `shared/delta` 使用它遍历 change spec
2. `shared/projection` 使用它遍历 scope spec
3. `dataview` 和 `whiteboard` 的 spec 内部索引统一使用它构建
4. 不再在多个 package 里重复实现 schema tree walker
5. 不再在多个 package 里手写 `Record<string, spec>` 的反向索引
6. 不再在多个 package 里手写 dot-key split / join

用途边界：

1. `walkSpec`
   - `changeSpec`
   - `scopeSpec`
2. `createTableIndex`
   - field kind
   - filter kind
   - view type
   - field value kind
   - node
   - toolbar item / panel
3. `createOneToOneIndex`
   - toolbar panel -> item
   - item -> panel
   - 任何唯一反向关系
4. `createOneToManyIndex`
   - node type -> controls
   - panel/layout -> item
   - 任何一对多反向关系
5. `splitDotKey` / `joinDotKey`
   - `FieldKey`
   - `TargetKey`

最终规则：

1. `@shared/spec` 只负责机械索引构建
2. 不负责业务语义
3. 不暴露业务级 `compileXXXSpec`
4. root 只暴露 `walkSpec`、`createTableIndex`、`createOneToOneIndex`、`createOneToManyIndex`、`splitDotKey`、`joinDotKey`
5. `dataview` 和 `whiteboard` 不允许把它当业务 API 使用

## 4.2 `@shared/delta`

最终 root public API 只保留：

```ts
export const change: <const TSpec extends Record<string, unknown>>(
  spec: TSpec
) => {
  create(): inferred state
  flag(state: inferred state, key: string): void
  ids: {
    add(state: inferred state, key: string, id: string): void
    update(state: inferred state, key: string, id: string): void
    remove(state: inferred state, key: string, id: string): void
    clear(state: inferred state, key: string): void
  }
  set(state: inferred state, key: string, value: unknown): void
  has(state: inferred state): boolean
  take(state: inferred state): inferred state
}
```

family patch grammar 直接内联为 plain object：

```ts
type FamilyPatch<TId extends string> = {
  set?: readonly TId[]
  remove?: readonly TId[]
  order?: true | readonly TId[]
}
```

直接删除的公共 API：

1. `IdDelta`
2. `EntityDelta`
3. `idDelta`
4. `entityDelta`
5. `fromChangeSet`
6. `fromIdDelta`
7. `fromSnapshots`
8. `mergeEntityDelta`
9. `normalizeEntityDelta`
10. `writeEntityChange`
11. `createChangeState`
12. `cloneChangeState`
13. `hasChangeState`
14. `mergeChangeState`
15. `takeChangeState`
16. `ChangeSchema`
17. `ChangeFieldSpec`
18. `isListEqual`
19. `projectListChange`
20. `ListChange`
21. `publishStruct`
22. `publishEntityList`
23. `PublishedStruct`
24. `PublishedEntityList`
25. `createEntityDeltaSync`
26. `EntityDeltaSyncPatch`
27. `EntityDeltaSyncSpec`
28. 任何 builder 风格 `defineChangeSpec`

最终 internal-only：

1. change state merge / clone 细节
2. family patch normalize helper
3. publish helper
4. list diff helper
5. id delta 中间结构

最终写法：

```ts
export const renderChange = change({
  node: 'ids',
  edge: {
    statics: 'ids',
    active: 'ids',
    labels: 'ids',
    masks: 'ids',
    staticsIds: 'flag',
    activeIds: 'flag',
    labelsIds: 'flag',
    masksIds: 'flag'
  },
  chrome: {
    scene: 'flag',
    edge: 'flag'
  }
} as const)
```

规则：

1. root 只有 `change`
2. leaf grammar 只有 `flag` / `ids` / `set`
3. family patch grammar 直接返回 plain object，不再暴露 `entityDelta` helper namespace
4. change state 类型由 spec 推导，不单独导出命名 type
5. list diff / publish / patch normalize 全部内聚到内部

## 4.3 `@shared/projection`

最终 root public API：

```ts
export const createProjectionRuntime: <const TSpec extends {
  createState(): unknown
  createRead(): unknown
  surface: Record<string, {
    kind: 'value'
    read(ctx: {
      input: unknown
      state: unknown
      read: unknown
    }): unknown
    isEqual?(left: unknown, right: unknown): boolean
    changed?(ctx: {
      prevInput: unknown
      nextInput: unknown
      state: unknown
      read: unknown
      change: unknown
    }): boolean
  } | {
    kind: 'family'
    ids(ctx: {
      input: unknown
      state: unknown
      read: unknown
    }): readonly string[]
    read(ctx: {
      input: unknown
      state: unknown
      read: unknown
    }, id: string): unknown
    isEqual?(left: unknown, right: unknown): boolean
    idsEqual?(left: readonly string[], right: readonly string[]): boolean
    changed?(ctx: {
      prevInput: unknown
      nextInput: unknown
      state: unknown
      read: unknown
      change: unknown
    }): boolean
    patch?(ctx: {
      prevInput: unknown
      nextInput: unknown
      state: unknown
      read: unknown
      change: unknown
    }): {
      set?: readonly string[]
      remove?: readonly string[]
      order?: true | readonly string[]
    } | undefined
  }>
  plan(ctx: {
    input: unknown
    state: unknown
    read: unknown
    change: unknown
  }): readonly {
    phase: string
    scope?: Record<string, unknown>
  }[]
  phases: Record<string, {
    run(ctx: {
      input: unknown
      state: unknown
      read: unknown
      scope?: Record<string, unknown>
      metrics: Record<string, number>
    }): void | {
      metrics?: Record<string, number>
    }
  }>
  capture(ctx: {
    state: unknown
    surface: Record<string, unknown>
  }): unknown
}>(
  spec: TSpec
) => {
  sync(input: unknown): unknown
  read(): unknown
  capture(): unknown
}
```

规则：

1. `slot` 直接改名为 `value`
2. scope 直接由 plain object spec 表达，不再暴露 `defineScope`
3. field 直接由 plain object leaf 表达，不再暴露 `valueField` / `familyField`
4. `ScopeSpec`、`ProjectionSpec`、`ProjectionRuntime`、各种上下文类型都不作为 public 类型暴露
5. value / family grammar 由 `createProjectionRuntime(spec)` 参数结构内联表达
6. `createPlan` / `mergePlans` 不再导出
7. 所有 scope merge / normalize / sync helper 内聚到内部
8. `changed` 是最终标准能力，必须支持按 field changed 短路
9. root 只有 `createProjectionRuntime`
10. `@shared/projection/internal` 删除

直接删除的公共 API：

1. `defineScope`
2. `flagScopeField`
3. `setScopeField`
4. `slotScopeField`
5. `valueField`
6. `familyField`
7. `Revision`
8. `ProjectionTrace`
9. `ProjectionSpec`
10. `ProjectionRuntime`
11. `ProjectionValueField`
12. `ProjectionFamilyField`
13. `ProjectionSurfaceField`
14. `ProjectionSurfaceTree`
15. `ProjectionStoreRead`
16. `ProjectionFamilySnapshot`
17. `ProjectionFieldSyncContext`
18. `ScopeSchema`
19. `ScopeInputValue`
20. `ScopeValue`
21. `ScopeFieldSpec`
22. `@shared/projection/internal`

## 4.4 `@shared/core`

`@shared/core` 这轮不做 root export 收口。

规则：

1. 现有 root export 暂时保留。
2. `dataview`、`whiteboard`、新的 shared runtime 装配只允许依赖 `entityTable` 和 `store`。
3. `shared/core` 新增能力不再继续向 root 聚合扩张。
4. 与 projection / dataview / whiteboard 重构直接相关的读模型能力，统一收敛到 `entityTable` 和 `store` 这两个入口。

### 4.4.1 `entityTable`

最终公共 API：

```ts
export const entityTable: {
  fromList<TId extends string, TEntity extends { id: TId }>(
    entities: readonly TEntity[]
  ): {
    ids: readonly TId[]
    byId: Record<TId, TEntity>
  }

  normalize<TId extends string, TEntity extends { id: TId }>(
    table: {
      ids: readonly TId[]
      byId: Record<TId, TEntity>
    }
  ): {
    ids: readonly TId[]
    byId: Record<TId, TEntity>
  }

  list<TId extends string, TEntity extends { id: TId }>(
    table: {
      ids: readonly TId[]
      byId: Record<TId, TEntity>
    }
  ): readonly TEntity[]

  ids<TId extends string, TEntity extends { id: TId }>(
    table: {
      ids: readonly TId[]
      byId: Record<TId, TEntity>
    }
  ): readonly TId[]

  get<TId extends string, TEntity extends { id: TId }>(
    table: {
      ids: readonly TId[]
      byId: Record<TId, TEntity>
    },
    id: TId
  ): TEntity | undefined

  has<TId extends string, TEntity extends { id: TId }>(
    table: {
      ids: readonly TId[]
      byId: Record<TId, TEntity>
    },
    id: TId
  ): boolean

  set<TId extends string, TEntity extends { id: TId }>(
    table: {
      ids: readonly TId[]
      byId: Record<TId, TEntity>
    },
    entity: TEntity
  ): {
    ids: readonly TId[]
    byId: Record<TId, TEntity>
  }

  patch<TId extends string, TEntity extends { id: TId }>(
    table: {
      ids: readonly TId[]
      byId: Record<TId, TEntity>
    },
    id: TId,
    patch: Partial<Omit<TEntity, 'id'>>
  ): {
    ids: readonly TId[]
    byId: Record<TId, TEntity>
  }

  remove<TId extends string, TEntity extends { id: TId }>(
    table: {
      ids: readonly TId[]
      byId: Record<TId, TEntity>
    },
    id: TId
  ): {
    ids: readonly TId[]
    byId: Record<TId, TEntity>
  }
}
```

直接删除：

1. `order`
2. `read.*` / `write.*` / `normalize.*` 这种分层命名

### 4.4.2 `store`

最终公共 API 只保留：

```ts
export const store: {
  read(target: unknown): unknown
  read(target: unknown, key: unknown): unknown
  batch(run: () => void): void

  value<T>(spec: {
    get(): T
    subscribe?(listener: () => void): () => void
    isEqual?(left: T, right: T): boolean
  }): unknown

  keyed<TKey, TValue>(spec: {
    get(key: TKey): TValue
    subscribe?(key: TKey, listener: () => void): () => void
    isEqual?(left: TValue, right: TValue): boolean
  }): unknown

  family<TId extends string, TValue>(spec: {
    ids(): readonly TId[]
    get(id: TId): TValue | undefined
    subscribeIds?(listener: () => void): () => void
    subscribeKey?(id: TId, listener: () => void): () => void
    isEqual?(left: TValue, right: TValue): boolean
  }): unknown

  object(fields: Record<string, unknown>): unknown
}
```

直接删除：

1. `peek`
2. `joinUnsubscribes`
3. `createReadStore`
4. `createValueStore`
5. `createNormalizedValue`
6. `createKeyedReadStore`
7. `createKeyedStore`
8. `createTableStore`
9. `createFamilyStore`
10. `createDerivedStore`
11. `createKeyedDerivedStore`
12. `createProjectedStore`
13. `createProjectedKeyedStore`
14. `createStructStore`
15. `createStructKeyedStore`
16. `createStagedValueStore`
17. `createStagedKeyedStore`
18. `createFrameValueStore`
19. `createFrameKeyedStore`
20. `table.project.field`

规则：

1. 公共组合语言只有 `value / keyed / family / object`
2. 返回类型由工厂调用推导，不单独暴露命名 store type
3. 任何面向业务的读模型都必须由这四个构成

## 4.5 `@shared/mutation`

最终 root public API：

```ts
export const createMutationEngine: <TDoc, TOp extends { type: string }, TCtx, TPublish>(input: {
  document: TDoc
  meta: Record<string, {
    family: string
    sync?: 'live' | 'checkpoint'
    history?: boolean
  }>
  operations: Record<string, {
    targets(op: TOp): readonly string[]
    apply(ctx: TCtx, op: TOp): void
    footprint?(ctx: TCtx, op: TOp): void
  }>
  conflicts(left: string, right: string): boolean
  publish: {
    init(document: TDoc): TPublish
    reduce(input: {
      document: TDoc
      previous?: TPublish
      operations: readonly TOp[]
    }): TPublish | undefined
  }
  history?: {
    limit?: number
    mergeWindowMs?: number
  }
}) => {
  apply(op: TOp): TPublish | undefined
  batch(ops: readonly TOp[]): TPublish | undefined
  read(): TDoc
}

export const createHistoryPort: (input?: {
  limit?: number
  mergeWindowMs?: number
}) => {
  read(): unknown
  push(entry: unknown): void
}
```

直接删除：

1. `path`
2. `Path`
3. `PathKey`
4. `record`
5. `RecordPathMutation`
6. `meta`
7. `meta.create`
8. `meta.family`
9. `readOpMeta`
10. `compile`
11. `compileControl`
12. `mutationTrace`
13. `planningContext`
14. `CommandMutationEngine`
15. `OperationMutationRuntime`
16. `mutationFailure`
17. `mutationResult`
18. `history`
19. 所有 `Mutation*` / `History*` / `Planning*` / `Issue*` 命名 type root export
20. `./path`
21. `./meta`
22. `./compiler`
23. `./engine`
24. `./history`
25. `./write`

最终规则：

1. operation meta 直接是 const object table
2. target key 直接是字符串 grammar
3. public API 不再暴露路径数组
4. publish / history 结构直接内联到工厂参数，不暴露 companion type namespace
5. `@shared/mutation` 最终 root 只保留 `createMutationEngine` 和 `createHistoryPort`

---

## 5. Dataview 最终 API

## 5.1 mutation key

最终类型：

```ts
export type DataviewTargetKey =
  | 'records'
  | `records.${RecordId}`
  | `records.${RecordId}.values.${FieldId}`
  | 'fields'
  | `fields.${FieldId}`
  | `fields.${FieldId}.values.${RecordId}`
  | 'views'
  | `views.${ViewId}`
  | 'activeView'
  | `external.${string}`
```

规则：

1. `DataviewMutationKey = Path` 直接删除
2. `dataviewMutationKey.*` helper 直接删除
3. `serializeDataviewMutationKey` 直接删除

## 5.2 dataview delta

最终公共 spec：

```ts
export const documentChangeSpec = {
  reset: 'flag',
  meta: 'flag',
  records: 'ids',
  values: 'ids',
  fields: 'ids',
  schemaFields: 'ids',
  views: 'ids'
} as const

export const activeChangeSpec = {
  reset: 'flag',
  view: 'flag',
  query: 'flag',
  table: 'flag',
  gallery: 'flag',
  kanban: 'flag',
  records: {
    matched: 'flag',
    ordered: 'flag',
    visible: 'flag'
  },
  fields: 'ids',
  sections: 'ids',
  items: 'ids',
  summaries: 'ids'
} as const
```

规则：

1. `DocumentDelta` / `ActiveDelta` / `DataviewDelta` 由 change spec 驱动
2. `projectDocumentDelta()` / `projectActiveDelta()` 只负责写 shared delta 结构

## 5.3 field kind

最终公共 spec：

```ts
export const fieldKindSpec = {
  text: { ... },
  number: { ... },
  select: { ... },
  multiSelect: { ... },
  status: { ... },
  date: { ... },
  boolean: { ... },
  url: { ... },
  email: { ... },
  phone: { ... },
  asset: { ... }
} as const
```

规则：

1. `createKindSpec` 直接删除
2. `getKindSpec` 只允许作为模块内部读取封装
3. `field/spec.ts` 的中间包装层直接收口进模块内部索引构建
4. `fieldKindSpec` 在模块初始化或 runtime 创建时内部编译为索引，不暴露公开 compile API

## 5.4 filter

最终公共 spec：

```ts
export const filterSpec = {
  text: {
    presets: {
      contains: { operator: 'contains', valueMode: 'editable' },
      eq: { operator: 'eq', valueMode: 'editable' },
      neq: { operator: 'neq', valueMode: 'editable' },
      exists_true: { operator: 'exists', valueMode: 'fixed', fixedValue: true },
      exists_false: { operator: 'exists', valueMode: 'fixed', fixedValue: false }
    },
    editor: 'text',
    plan: { ... },
    candidate: { ... }
  },
  number: { ... },
  date: { ... },
  select: { ... },
  multiSelect: { ... },
  status: { ... },
  boolean: { ... },
  asset: { ... }
} as const
```

规则：

1. `defineFilterPreset` 直接删除
2. `createFilterSpec` 直接删除
3. `createSortedFilterSpec` 直接删除
4. `createOptionBucketFilterSpec` 直接删除
5. `getFilterSpec` 不再承担装配职责
6. `filterSpec` 在模块内部编译为查找索引，不暴露公开 compile API

## 5.5 view type

最终公共 spec：

```ts
export const viewTypeSpec = {
  table: {
    token: token('meta.view.table', 'Table'),
    Icon: Table2,
    capabilities: {
      create: true,
      group: true
    },
    defaults: {
      display(fields) {
        return fields.map(field => field.id)
      },
      options: {
        widths: {},
        showVerticalLines: true,
        wrap: false
      }
    }
  },
  gallery: {
    token: token('meta.view.gallery', 'Gallery'),
    Icon: LayoutGrid,
    capabilities: {
      create: true,
      group: false
    },
    defaults: {
      display: () => [],
      options: {
        card: {
          wrap: false,
          size: 'md',
          layout: 'stacked'
        }
      }
    }
  },
  kanban: {
    token: token('meta.view.kanban', 'Kanban'),
    Icon: KanbanSquare,
    capabilities: {
      create: true,
      group: true
    },
    defaults: {
      display: () => [],
      options: {
        card: {
          wrap: false,
          size: 'md',
          layout: 'compact'
        },
        fillColumnColor: true,
        cardsPerColumn: 25
      }
    }
  }
} as const
```

规则：

1. `meta.view`
2. `CREATE_VIEW_ITEMS`
3. `supportsGroupSettings`
4. `createDefaultViewOptions`
5. `PageHeader` 的 view icon switch

全部统一由 `viewTypeSpec` 驱动。
内部索引构建由模块或 runtime 工厂完成，不暴露公开 compile API。

## 5.6 field value react spec

最终公共 spec：

```tsx
export const fieldValueSpec = {
  title: {
    panelWidth: 'default',
    Editor: InputEditor,
    createDraft(field, value, seedDraft) { ... },
    parseDraft(field, draft) { ... },
    render(field, props) { ... },
    capability: {}
  },
  text: {
    panelWidth: 'default',
    Editor: InputEditor,
    createDraft(field, value, seedDraft) { ... },
    parseDraft(field, draft) { ... },
    render(field, props) { ... },
    capability: {}
  },
  status: {
    panelWidth: 'picker',
    Editor: StatusValueEditor,
    createDraft(field, value, seedDraft) { ... },
    parseDraft(field, draft) { ... },
    render(field, props) { ... },
    capability: {}
  }
} as const
```

规则：

1. `getFieldValueSpec` 直接删除
2. `createTextPropertySpec` / `createStatusFieldSpec` 等 helper 直接删除
3. `field` 作为行为函数参数传入，不再在 lookup 时创建 spec 对象
4. `fieldValueSpec` 在模块内部构建 kind -> behavior 索引，不暴露公开 compile API

## 5.7 dataview runtime 读模型

最终公共 spec：

```ts
export const pageModelSpec = {
  body: {
    kind: 'value',
    read: ctx => ({ ... })
  },
  header: {
    kind: 'value',
    read: ctx => ({ ... })
  },
  toolbar: {
    kind: 'value',
    read: ctx => ({ ... })
  },
  query: {
    kind: 'value',
    read: ctx => ({ ... })
  },
  settings: {
    kind: 'value',
    read: ctx => ({ ... })
  },
  sortRow: {
    kind: 'family',
    ids: ctx => ctx.sortRuleIds,
    read: (ctx, id) => ({ ... })
  }
} as const

export const cardModelSpec = {
  properties: {
    kind: 'family',
    ids: ctx => ctx.visibleFieldIds,
    read: (ctx, fieldId) => ({ ... })
  },
  content: {
    kind: 'value',
    read: ctx => ({ ... })
  }
} as const
```

规则：

1. `createPageModel` 改成编译 page model spec
2. `createRecordCardPropertiesStore` 改成 family spec
3. `createItemCardContentStore` 改成 value spec
4. `createActiveSourceRuntime` 内部所有 `createTableStore / project.field` 直接删除

---

## 6. Whiteboard 最终 API

## 6.1 node spec

最终公共 spec：

```tsx
export const nodeSpec = {
  text: {
    meta: {
      type: 'text',
      family: 'text',
      name: 'Text',
      icon: 'text',
      controls: ['text']
    },
    schema: {
      fields: {
        'data.text': {
          label: 'Text',
          type: 'text'
        },
        'style.fill': {
          label: 'Background',
          type: 'color'
        },
        'style.fontSize': {
          label: 'Font size',
          type: 'number',
          min: 8,
          step: 1
        }
      }
    },
    behavior: {
      render: TextNode,
      style: resolveTextStyle,
      layout: textLayoutSpec
    }
  },
  shape: { ... },
  sticky: { ... }
} as const
```

内部索引必须直接产出：

1. `metaByType`
2. `schemaByType`
3. `renderByType`
4. `capabilityByType`
5. `styleFieldKindByType`
6. `controlsByType`

规则：

1. `nodeRegistry` 直接删除
2. `register` 直接删除
3. `createField` / `dataField` / `styleField` / `createSchema` 直接删除
4. `supportsStyle(...path...)` 改为 `supportsStyle(...fieldKey...)`
5. `nodeSpec` 的编译只允许发生在模块内部或 `createEditor(...)` 内部

## 6.2 toolbar spec

最终公共 spec：

```ts
export const toolbarSpec = {
  items: {
    scope: {
      panelKey: 'scope',
      units: 1,
      render: ScopeButton
    },
    align: {
      panelKey: null,
      units: 1,
      render: AlignButton
    },
    'font-size': {
      panelKey: 'font-size',
      units: 1,
      render: FontSizeButton
    }
  },
  panels: {
    scope: {
      itemKey: 'scope',
      render: ScopePanel
    },
    'font-size': {
      itemKey: 'font-size',
      render: FontSizePanel
    }
  },
  layouts: {
    node: [
      ['scope'],
      ['align', 'group'],
      ['shape-kind', 'font-size', 'bold', 'italic', 'text-align', 'text-color', 'stroke', 'fill'],
      ['lock', 'more']
    ],
    edge: [
      ['edge-stroke', 'edge-marker-start', 'edge-marker-end']
    ]
  },
  visibility: {
    scope(ctx) { ... },
    align(ctx) { ... }
  }
} as const
```

规则：

1. item / panel / layout 三张表固定
2. `resolveToolbarRecipe` 直接删除
3. `renderToolbarPanel` 的 `find(...)` 直接删除，改为编译索引
4. `toolbarSpec` 的编译只允许发生在模块内部或 `createEditor(...)` / `createWhiteboardRuntime(...)` 内部

## 6.3 whiteboard scene spec

最终公共 spec：

```ts
export const graphChangeSpec = { ... } as const
export const uiChangeSpec = { ... } as const
export const renderChangeSpec = { ... } as const

export const sceneProjectionSpec = {
  surface: {
    items: {
      kind: 'family',
      ids: ctx => ctx.state.items.ids,
      read: (ctx, id) => ctx.state.items.byId[id],
      changed: ctx => ctx.change.render?.items === true,
      patch: ctx => ctx.render.itemPatch
    },
    statics: {
      kind: 'family',
      ids: ctx => ctx.state.render.statics.ids,
      read: (ctx, id) => ctx.state.render.statics.byId[id],
      changed: ctx => ctx.change.render?.edge?.statics === true,
      patch: ctx => ctx.render.staticPatch
    },
    labels: {
      kind: 'family',
      ids: ctx => ctx.state.render.labels.ids,
      read: (ctx, id) => ctx.state.render.labels.byId[id],
      changed: ctx => ctx.change.render?.edge?.labels === true,
      patch: ctx => ctx.render.labelPatch
    },
    masks: {
      kind: 'family',
      ids: ctx => ctx.state.render.masks.ids,
      read: (ctx, id) => ctx.state.render.masks.byId[id],
      changed: ctx => ctx.change.render?.edge?.masks === true,
      patch: ctx => ctx.render.maskPatch
    }
  },
  phases: {
    graph: { scope: ..., run: ... },
    spatial: { scope: ..., run: ... },
    items: { scope: ..., run: ... },
    ui: { scope: ..., run: ... },
    render: { scope: ..., run: ... }
  }
} as const
```

规则：

1. render family patch 粒度最终下沉到 bucket / edge 级
2. `changed` 短路必须完成
3. surface sync 只消费 compiled field spec 和 patch

## 6.4 whiteboard 装配根对象

最终公共 spec：

```ts
export const whiteboardSpec = {
  nodes: nodeSpec,
  toolbar: toolbarSpec,
  scene: sceneProjectionSpec
} as const
```

运行时入口：

```ts
export const createEditor: (input: {
  spec: typeof whiteboardSpec
  document: WhiteboardDocument
  history?: ReturnType<typeof createHistoryPort>
}) => WhiteboardEditor

export const createWhiteboardRuntime: (input: {
  spec: typeof whiteboardSpec
  editor: WhiteboardEditor
}) => WhiteboardRuntime
```

规则：

1. `Whiteboard` 不再接收 `nodeRegistry`
2. `createEditor` / `createWhiteboardRuntime` 直接接收 `spec`
3. spec 编译在工厂内部完成，不暴露公开 compile API

---

## 7. 最终装配根对象

最终状态下，业务层只装配最终 spec，不装配 helper。

### 7.1 dataview

```ts
export const dataviewSpec = {
  change: {
    document: documentChangeSpec,
    active: activeChangeSpec
  },
  viewTypes: viewTypeSpec,
  fieldKinds: fieldKindSpec,
  filters: filterSpec,
  fieldValues: fieldValueSpec,
  models: {
    page: pageModelSpec,
    card: cardModelSpec
  }
} as const

export const createEngine: (input: {
  spec: typeof dataviewSpec
  document: DataDoc
  history?: ReturnType<typeof createHistoryPort>
}) => DataviewEngine
```

### 7.2 whiteboard

```ts
export const whiteboardSpec = {
  nodes: nodeSpec,
  toolbar: toolbarSpec,
  scene: sceneProjectionSpec
} as const
```

---

## 8. 实施顺序

阶段执行规则：

1. 阶段是代码改造批次，不是中间可运行里程碑。
2. 阶段之间不要求代码可编译、可测试、可启动。
3. 阶段之间允许存在类型错误、构建失败、调用断裂。
4. 不允许为了维持阶段之间可运行而引入过渡层、兼容层、双写层、临时 re-export。
5. 只有全部阶段完成后，才做一次最终联调、类型检查、构建和测试。

## Phase 1：shared 内核定型

这一阶段只做 shared 最终内核，不做 dataview / whiteboard 消费方迁移收尾。

必须一次完成下面这些改动：

1. 新增 `@shared/spec`
2. `@shared/spec` root export 收口为 `walkSpec`、`createTableIndex`、`createOneToOneIndex`、`createOneToManyIndex`、`splitDotKey`、`joinDotKey`
3. `walkSpec`、`createTableIndex`、`createOneToOneIndex`、`createOneToManyIndex`、`splitDotKey`、`joinDotKey` 全部落地
4. `shared/delta` root public surface 收口为 `change`
5. family patch helper 全部内聚到 `shared/delta` 内部
6. `createChangeState` 体系收口为 `change(spec)`
7. `shared/projection` root 收口为 `createProjectionRuntime`
8. `shared/projection` 删除 field / scope helper 和 `./internal`
9. `shared/mutation` root 收口为 `createMutationEngine` / `createHistoryPort`
10. `shared/mutation` 删除所有 subpath export，只保留 `.`
11. `shared/mutation` 删除 `path` 和 `meta` 公共装配 API
12. `shared/core/store` 最终 API 定型为 `read / batch / value / keyed / family / object`
13. shared 公共词汇 `slot -> value`
14. `shared/delta` / `shared/projection` 全部改用 `walkSpec`

完成标准：

1. `shared` 公共导出中不再出现 `slot`
2. `shared` 公共导出中不再出现 `Path`
3. `@shared/spec` root 只保留 `walkSpec`、`createTableIndex`、`createOneToOneIndex`、`createOneToManyIndex`、`splitDotKey`、`joinDotKey`
4. `@shared/delta` root 只保留 `change`
5. `@shared/projection` root 只保留 `createProjectionRuntime`
6. `@shared/projection` 不再导出 `defineScope`、`flagScopeField`、`setScopeField`、`slotScopeField`、`valueField`、`familyField`
7. `@shared/projection` 没有 `./internal`
8. `@shared/mutation` root 只保留 `createMutationEngine` / `createHistoryPort`
9. `@shared/mutation/path`、`@shared/mutation/meta`、`@shared/mutation/compiler`、`@shared/mutation/engine`、`@shared/mutation/history`、`@shared/mutation/write` 全部删除
10. `shared/core/store` 不再导出 `createTableStore`、`createFamilyStore`、`createStructStore`、`createProjectedStore`、`createProjectedKeyedStore`
11. `shared/delta` 与 `shared/projection` 不再各自维护独立 tree walker

## Phase 2：dataview 结构迁移

这一阶段只重写 dataview 的数据契约、target key、change spec 和 spec 索引，不处理 react/runtime 读模型收尾。

必须一次完成下面这些改动：

1. dataview 全面切换 `ids + byId`
2. dataview 内部所有公共实体顺序字段统一从 `order` 改为 `ids`
3. `DataviewTargetKey` 全面切换到字符串 grammar
4. `documentChangeSpec` / `activeChangeSpec` 全面切到 `change(spec)` 体系
5. `fieldKindSpec` 内部索引构建统一改用 `createTableIndex`
6. `filterSpec` 内部索引构建统一改用 `createTableIndex`
7. `viewTypeSpec` 内部索引构建统一改用 `createTableIndex`
8. `FieldKey` / `TargetKey` 解析统一改用 `splitDotKey`

完成标准：

1. `dataview-core` 公共类型中不再出现 `order`
2. `dataview-core` 公共 API 中不再出现 `Path`
3. `dataview` 代码中不再存在 `createKindSpec`
4. `dataview` 代码中不再存在 `createFilterSpec`
5. `dataview` 代码中不再存在 `createSortedFilterSpec`
6. `dataview` 代码中不再存在 `createOptionBucketFilterSpec`
7. `dataview` 里不再存在重复的 spec 反向索引构建代码

## Phase 3：dataview runtime / react 收口

这一阶段只把 dataview runtime、engine、react 层切到最终 shared API 和最终 spec 装配。

必须一次完成下面这些改动：

1. source runtime 全面改到新 store API
2. page / card / active source 全面改成 model spec
3. `fieldValueSpec` 内部索引构建统一改用 `createTableIndex`
4. create view / settings / header 全部改由 `viewTypeSpec` 驱动
5. `dataviewSpec` 与 `createEngine({ spec, document })` 装配入口彻底落地

完成标准：

1. `dataview-runtime` 不再出现 `createTableStore`
2. `dataview-runtime` 不再出现 `table.project.field`
3. `dataview-react` 不再出现 `getFieldValueSpec`
4. `dataview-react` 不再出现 view type `switch`
5. `dataview-react` 不再手写 kind -> spec lookup
6. dataview 业务装配不再直接装配 helper，只装配最终 spec

## Phase 4：whiteboard 结构与装配迁移

这一阶段只重写 whiteboard 的 node / toolbar / fieldKey / root spec 装配，不处理 scene render 收尾。

必须一次完成下面这些改动：

1. `nodeSpec` 全面取代 registry / field helper / schema helper
2. `nodeSpec` 内部索引构建统一改用 `createTableIndex` / `createOneToManyIndex`
3. `toolbarSpec` 全面改成 `items / panels / layouts / visibility` 四张表
4. `toolbarSpec` 内部索引构建统一改用 `createTableIndex` / `createOneToOneIndex` / `createOneToManyIndex`
5. `fieldKey` 字符串体系彻底落地
6. `whiteboardSpec`、`createEditor({ spec, document })`、`createWhiteboardRuntime({ spec, editor })` 彻底落地

完成标准：

1. `whiteboard-react` 不再出现 `nodeRegistry`
2. `whiteboard-react` 不再出现 `register`
3. `whiteboard-react` 不再出现 `createField` / `styleField` / `dataField`
4. `whiteboard-react` 不再出现 `createSchema`
5. `whiteboard-editor` 不再出现路径数组 style capability API
6. `whiteboard` 不再手写 spec 反向索引和 panel/item lookup
7. whiteboard 业务装配不再直接装配 helper，只装配最终 spec

## Phase 5：whiteboard scene / render 增量化

这一阶段只重写 scene projection、surface sync、render patch 粒度和 changed 短路。

必须一次完成下面这些改动：

1. `graphChangeSpec`、`uiChangeSpec`、`renderChangeSpec` 全面切到 `change(spec)` 体系
2. `sceneProjectionSpec` 全面切到 shared projection 最终 API
3. render family patch 粒度最终下沉到 bucket / edge 级
4. `changed` 短路能力贯通 graph / ui / render / surface sync
5. surface sync 全面改为只消费 `changed + patch`
6. render 内部完整复用前面阶段已经产出的 delta 和 changes

完成标准：

1. `whiteboard-editor-scene` surface sync 全部走 `changed + patch`
2. statics / labels / masks 不再以“触发后整族重建”作为最终策略
3. statics / labels / masks 最终 patch 粒度下沉到 bucket / edge
4. `whiteboard` scene projection 不再依赖旧 projection helper API
5. render 管线最终只消费最终 delta / change / projection grammar

## Phase 6：旧 API 删除与最终联调

这一阶段才做最终清场和全仓跑通。

必须一次完成下面这些改动：

1. 直接删除下面这些旧 API，不保留兼容：
   `slot`
   `order` 作为公共字段名
   `Path`
   `path`
   `PathKey`
   `meta`
   `meta.create`
   `meta.family`
   `idDelta`
   `entityDelta`
   `createChangeState`
   `cloneChangeState`
   `mergeChangeState`
   `takeChangeState`
   `hasChangeState`
   `createEntityDeltaSync`
   `publishStruct`
   `publishEntityList`
   `defineScope`
   `flagScopeField`
   `setScopeField`
   `slotScopeField`
   `valueField`
   `familyField`
   `ProjectionSpec`
   `ProjectionRuntime`
   `ScopeSchema`
   `ProjectionFieldSyncContext`
   `createTableStore`
   `createFamilyStore`
   `createStructStore`
   `createProjectedStore`
   `createProjectedKeyedStore`
   `createNodeRegistry`
   `register`
   `createField`
   `dataField`
   `styleField`
   `createSchema`
   `getFieldValueSpec`
   `createTextPropertySpec`
   `createStatusFieldSpec`
   `createKindSpec`
   `createFilterSpec`
   `createSortedFilterSpec`
   `createOptionBucketFilterSpec`
   `@shared/projection/internal`
   `@shared/mutation/path`
   `@shared/mutation/meta`
   `@shared/mutation/compiler`
   `@shared/mutation/engine`
   `@shared/mutation/history`
   `@shared/mutation/write`
   `@shared/mutation` root helper export：`record / mutationTrace / planningContext / history / mutationFailure / mutationResult / Mutation* / History* / Planning* / Issue*`
2. 删除改造过程中产生的所有中间层、过渡层、兼容层、类型转换层、临时 re-export
3. 全仓统一最终词汇、最终 spec、最终 root surface
4. 在全部改造完成后执行一次最终联调、类型检查、构建和测试

完成标准：

1. 仓库中不再残留任何旧 API 导出
2. 仓库中不再残留任何中间层、过渡层、兼容层、临时 re-export
3. 只有这一阶段要求整仓可编译、可测试、可运行
4. 最终联调结果满足本文件第 9 节全部硬标准

---

## 9. 完成判定

全部完成后，仓库必须满足下面这些硬标准：

1. 公共配置层不再暴露任何 `Path[]`
2. 公共实体族不再暴露任何 `order`
3. 所有 spec 都是 plain object
4. 所有 kind/type 体系都由 literal spec table 驱动
5. 所有 runtime factory 直接消费 spec，并在工厂内部构建索引
6. 所有 spec 生成的内部索引都复用 `@shared/spec`
7. 仓库中不再存在重复的 tree walker、spec reverse index、dot-key split/join
8. `shared` root export 只保留最小表面：
   - `@shared/spec` root 只保留 `walkSpec`、`createTableIndex`、`createOneToOneIndex`、`createOneToManyIndex`、`splitDotKey`、`joinDotKey`
   - `@shared/delta` root 只保留 `change`
   - `@shared/projection` root 只保留 `createProjectionRuntime`
   - `@shared/mutation` root 只保留 `createMutationEngine` / `createHistoryPort`
9. `shared`、`dataview`、`whiteboard` 三条线使用同一套词汇：
   - `value`
   - `family`
   - `flag`
   - `ids`
   - `set`
   - `fieldKey`
   - `targetKey`
   - `phase`
10. 只有在全部阶段完成后，整仓才要求通过最终联调、类型检查、构建和测试

这就是最终状态。
