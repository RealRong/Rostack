# Shared / Dataview / Whiteboard 实现审计与最终简化方案

## 目标

本审计只回答四类问题：

1. `shared` 暴露过少，是否导致上层频繁自定义类型、强转、`unknown`、`any`、泛型复杂化。
2. 是否还没有真正做到 `spec + plain object + 字符串配置 + callback`，而仍在暴露构建/解析 helper 给上层拼装。
3. 是否出现类似 patch 的退化：因为重构而回到 parse / path / string key 兜底，delta 与类型传递不顺畅。
4. 是否还存在中间层、兼容层、别名层、重复封装层。

本文件只保留“当前仍然妨碍长期最优”的问题，不重复已经完成的重构。

## 审计边界

本次重点检查：

- `shared/spec`
- `shared/delta`
- `shared/projection`
- `shared/mutation`
- `shared/draft`
- `dataview/packages/dataview-core`
- `dataview/packages/dataview-engine`
- `whiteboard/packages/whiteboard-core`
- `whiteboard/packages/whiteboard-editor`
- `whiteboard/packages/whiteboard-editor-scene`
- `whiteboard/packages/whiteboard-react`

本次明确不计入问题的部分：

- 面向用户输入的 parse：例如日期草稿、剪贴板、URL、布局输入等。
- 领域本身必须动态的值：例如 dataview 字段值模型中的 `unknown`。
- 纯测试中的临时断言。

真正要解决的是“基础设施不够强，导致上层被迫自己做类型桥接、字符串编码、helper 拼装、wrapper 适配”。

## 结论

当前实现已经明显比前一轮更接近最终态，但**还没有达到长期最优**。剩余问题不是功能正确性问题，而是**基础设施吸收不彻底**的问题。

最大的四个残留块：

1. `@shared/projection` 和 `@shared/delta` 仍然把不少泛型复杂度、叶子编译、scope/change 桥接留给了上层和内部断言。
2. dataview 与 whiteboard 仍各自维护一整套 mutation compile / issue / trace / operation reducer glue。
3. whiteboard node/schema patch 路径仍然是“泛型 record patch + path helper + unknown 回填”，没有收敛到真正的 spec 化结构写入。
4. 上层仍存在多层 wrapper / alias / compile facade，尤其是 projection runtime、node spec compile、trace / issue / compile 的别名层。

## 审计总表

| 编号 | 级别 | 问题 | 典型位置 | 结论 |
| --- | --- | --- | --- | --- |
| A1 | 高 | `@shared/projection` 泛型面过重，内部与上层都存在大量类型桥接 | `shared/projection/src/runtime.ts` `shared/projection/src/scope.ts` `dataview/packages/dataview-engine/src/active/projection/spec.ts` `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts` | 必须继续下沉到 shared，做成更强的推导式 projection API |
| A2 | 高 | `@shared/delta` 仍然是 helper-heavy API，spec 与类型表分离，内部断言多 | `shared/delta/src/change.ts` `dataview/packages/dataview-engine/src/contracts/delta.ts` `whiteboard/packages/whiteboard-editor-scene/src/contracts/delta.ts` | 必须继续收口，改成单次装配、字符串 spec 驱动 |
| A3 | 高 | mutation compile 循环仍由 dataview / whiteboard 各自维护 | `dataview/packages/dataview-core/src/operations/compile.ts` `whiteboard/packages/whiteboard-core/src/operations/compile.ts` | 必须吸收到 `@shared/mutation` |
| A4 | 高 | operation definition / reducer glue 仍重复且带 `as never` | `dataview/packages/dataview-core/src/operations/spec.ts` `whiteboard/packages/whiteboard-core/src/operations/apply.ts` `whiteboard/packages/whiteboard-core/src/operations/definitions.ts` | 必须由 shared 提供最终态 reducer constructor |
| A5 | 高 | whiteboard node/schema update 仍停留在 path patch 语义，带 `as any` / `unknown` 回填 | `whiteboard/packages/whiteboard-core/src/node/update.ts` `whiteboard/packages/whiteboard-core/src/registry/schema.ts` | 这是当前最明显的退化点，必须改成 spec 化结构写入 |
| A6 | 中 | spec 编译与索引能力仍过于底层，导致上层重复 build index / walk leaves | `shared/spec/src/index.ts` `whiteboard/packages/whiteboard-editor/src/types/node/compile.ts` `whiteboard/packages/whiteboard-react/src/features/node/registry/compile.ts` `dataview/packages/dataview-core/src/view/typeSpec.ts` | 应补强 `@shared/spec`，让上层不再手搓编译器 |
| A7 | 中 | 字符串 key / parse / encode 仍散落在多个域里，各自编码 | `dataview/packages/dataview-engine/src/active/index/bucket.ts` `dataview/packages/dataview-core/src/operations/key.ts` `whiteboard/packages/whiteboard-editor-scene/src/model/render/patch.ts` | 应沉到 shared 的 key codec 设施 |
| A8 | 中 | projection family adapter 与 trace facade 仍由上层自己包 | `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts` `dataview/packages/dataview-engine/src/active/projection/runtime.ts` | 应继续下沉到 `@shared/projection` |
| A9 | 中 | alias / facade / 兼容样式命名仍残留 | `dataview/packages/dataview-core/src/operations/trace.ts` `dataview/packages/dataview-core/src/operations/issue.ts` `dataview/packages/dataview-core/src/operations/compile.ts` | 应删除别名层，只保留 canonical API |
| A10 | 低 | 某些 shared 能力已经存在但没有被更高层统一吸收 | `shared/core/src/store/table.ts` `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts` | 应作为 shared 内部底座继续复用，不再让上层重复写 stable family helper |

## 详细问题

### A1. `@shared/projection` 还不够“第一性”

当前问题：

- `ProjectionSpec<TInput, TState, TRead, TSurface, TPhaseName, TScopeMap, TPhaseMetrics, TCapture>` 这个泛型面仍然太大。
- `shared/projection/src/runtime.ts` 与 `shared/projection/src/scope.ts` 内部存在大量 `unknown`、`as ScopeValue`、`as ProjectionFamilySnapshot` 这类桥接。
- dataview 与 whiteboard 上层都被迫再包一层自己的 projection type alias。
- `whiteboard-editor-scene` 里还要自己维护 `createStableMapFamilyRead` / `createStableFamilyRead`。
- dataview active projection 又自己包一层 `createActiveProjectionRuntime` 来补 trace 与 snapshot 语义。

这说明：

- `shared/projection` 当前已经承担了 runtime，但还没有把“surface family 适配、scope 合并、trace 生成、capture 语义”一起收进去。
- 上层仍然在手动适配 shared，而不是直接以 shared 的最终 API 来写业务。

最终态必须是：

- 上层只写 plain object projection spec。
- `surface` 上直接写字符串 kind 与 callback。
- family map / family snapshot / value 三类常见 surface 都有 shared 提供的标准 adapter。
- phase scope 仍然用 plain object + `'flag' | 'set' | 'value'`，但类型推导与合并不再由上层承受。
- update 结果里直接带 trace / capture hook，不再需要 dataview / whiteboard 再包 runtime facade。

最终 API 形态：

```ts
const runtime = createProjection({
  state: () => createWorkingState(),
  read: ({ state, revision }) => ({ ... }),
  capture: ({ state, revision }) => ({ ... }),
  surface: {
    graph: {
      node: projection.family.map({
        read: state => state.graph.nodes,
        changed: state => state.delta.graph.nodes,
        order: state => state.delta.graph.order
      })
    }
  },
  plan: ({ input, state }) => ({
    phases: ['graph', 'render'],
    scope: {
      render: {
        node: true
      }
    }
  }),
  phases: {
    graph: ({ input, state, scope }) => ({ action: 'sync' }),
    render: ({ input, state, scope }) => ({ action: 'reuse' })
  }
})
```

这里不允许上层再写：

- `ProjectionSpec<...>` 巨型泛型别名
- `createStableMapFamilyRead`
- `createStableFamilyRead`
- 自己补一层 `createXxxProjectionRuntime`
- 自己把 projection trace 再二次组装成业务 trace

### A2. `@shared/delta` 还不是最终态 spec API

当前问题：

- `change<typeof spec, { ids: ... }>(spec)` 仍然要求上层维护第二套类型配置。
- `shared/delta/src/change.ts` 内部大量 `unknown`、`as ChangeStateOf`、叶子表编译、path 解析都还是手工完成。
- dataview 与 whiteboard 虽然已经用 plain object 字符串 spec，但仍要显式装配 helper runtime。

这说明：

- 当前 `@shared/delta` 只是从函数 helper 退到“字符串 spec + helper runtime”，还没有做到“单次声明、完整推导、最小暴露面”。

最终态必须是：

- 一个 delta 只有一个 canonical constructor。
- spec 就是 plain object。
- 类型表只出现一次，不允许再出现 `ids` / `set` 两层嵌套映射。
- 叶子编译、path 映射、state reset、take、has、entityDelta 转换全部沉到 shared。

最终 API 形态：

```ts
const renderDelta = createDelta<{
  node: NodeId
  'edge.statics': EdgeStaticId
  'edge.active': EdgeId
  'edge.labels': EdgeLabelKey
  'edge.masks': EdgeId
}>({
  spec: {
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
  }
})
```

这里不允许继续保留：

- `change<typeof spec, TConfig>(spec)`
- 上层依赖 deep path helper 去访问 delta leaf
- 上层自己做 leaf entry 编译

### A3. mutation compile 循环没有沉到底

当前问题：

- `dataview/packages/dataview-core/src/operations/compile.ts`
- `whiteboard/packages/whiteboard-core/src/operations/compile.ts`

这两个文件都在做几乎同一件事：

- 初始化 `ops / outputs / issues`
- 为每个 intent 创建 compile ctx
- 收集 issue
- 阻断 / stop
- 增量 apply 到 working doc
- 汇总 compile outputs

dataview 额外又有：

- `operations/issue.ts`
- `operations/internal/compile/scope.ts`

whiteboard 额外又有：

- `operations/compile-context.ts`
- `operations/compile-handlers.ts`

这说明 compile loop 还没有真正进入 shared。

最终态必须是：

- `@shared/mutation` 直接提供最终态 compiler constructor。
- engine constructor 直接接受 compile 配置，不再要求领域包维护 compile loop。
- 上层只写“intent handler table + domain ctx extension + reduce function”。

最终 API 形态：

```ts
const engine = createMutationEngine({
  reducer,
  compile: {
    reduce: reduceOperations,
    context: ({ doc, ids, extra }) => ({
      read: ...,
      ids,
      emit: ...,
      fail: ...
    }),
    handlers: {
      'record.create': (intent, ctx) => { ... },
      'record.patch': (intent, ctx) => { ... }
    }
  }
})
```

这里不允许继续保留：

- dataview `compileIntents`
- whiteboard `compile`
- `createCompileScope`
- `createWhiteboardIntentContext`

这些都应该只是 shared compile engine 的内部语义，而不是上层长期 public 实现。

### A4. operation reducer glue 仍重复且 cast-heavy

当前问题：

- dataview `operations/spec.ts` 里 `definition.footprint?.(ctx, operation as never)` / `definition.apply(ctx, operation as never)`
- whiteboard `operations/apply.ts` 与 `operations/definitions.ts` 也有同类分发
- 说明 shared 已经有 `MutationOperationSpec`，但 reducer constructor 没有真正把按 `type` 收窄的 dispatch 一并做好

最终态必须是：

- shared 提供 `createOperationReducer({ table, createContext, done, serializeKey, conflicts })`
- `table[operation.type]` 的 footprint / apply 在 shared 内部自动收窄
- 上层不再出现 `operation as never`

### A5. whiteboard node/schema patch 仍然退化

当前问题：

- `whiteboard/packages/whiteboard-core/src/node/update.ts` 仍然有 `as any`
- `applyRecordMutation` 返回 `unknown`
- `buildNodeUpdateInverse` / `applyNodeUpdate` 需要不断把 `unknown` 回填成 `Node['data']` / `Node['style']`
- `whiteboard/packages/whiteboard-core/src/registry/schema.ts` 仍暴露 `compileDataUpdate` / `compileStyleUpdate` / `compileFieldRecord` 这套 helper API
- 上层大量代码都在通过 `mutationPath.of(...) + schema.node.compileXxxUpdate(...)` 来拼 mutation

这已经不是“领域动态值”的合理 `unknown`，而是 patch 基础设施不够强带来的退化。

最终态必须是：

- whiteboard node update 直接以 spec 化的 plain object 结构表达，不再由上层拼 path。
- `schema.node.compileDataUpdate` / `compileStyleUpdate` / `compileFieldRecord` 必须删除。
- shared/draft 负责把结构写入规范化为内部 patch，不允许业务层关心 path array。

最终 API 形态：

```ts
node.update(nodeId, {
  fields: {
    position: { x, y },
    size: { width, height }
  },
  records: {
    'data.widthMode': 'wrap',
    'data.wrapWidth': 180,
    'style.fontSize': 20,
    'data.kind': undefined
  }
})
```

或者在更底层：

```ts
schema.node.update({
  record: {
    'data.widthMode': 'wrap',
    'style.fontSize': 20
  }
})
```

核心原则：

- 上层写字符串 key 与 plain object。
- shared/draft 内部才有 path array。
- 不允许上层再显式 `mutationPath.of(...)`。

### A6. spec 编译能力仍然过于底层

当前问题：

- `shared/spec` 现在只有 `walkSpec` / `createTableIndex` / `splitDotKey` / `joinDotKey`
- `shared/delta/src/change.ts` 和 `shared/projection/src/scope.ts` 各自手写 leaf entry 编译
- `whiteboard-editor/src/types/node/compile.ts` 手写了多组 derived table index
- `whiteboard-react/src/features/node/registry/compile.ts` 又在 `compileNodeSpec` 之外补一层 compile
- dataview `view/typeSpec.ts`、field kind spec 也都各自创建 index

这说明 `@shared/spec` 还只是 primitives，不是“最终可复用的 spec compiler”。

最终态必须是：

- `@shared/spec` 提供 table/tree 两类编译器。
- table compiler 统一提供 `keys / values / entries / get / resolve / project`。
- tree compiler 统一提供 `leafEntries / keyParts / keySet / parent / children / prefix match`。
- `shared/delta`、`shared/projection`、whiteboard node spec compile、dataview view/field spec compile 都复用这一层。

最终 API 形态：

```ts
const nodeSpecIndex = spec.table(nodeSpec)
const changeSpecIndex = spec.tree(renderChangeSpec)
```

不再允许：

- 每个包都自己 `walkSpec(...)`
- 每个包都自己 `createTableIndex(...)` 后再二次派生一堆 map

### A7. 字符串 key codec 还没有沉到底

当前问题：

- dataview bucket index 依赖 `createBucketSpecKey`
- dataview mutation key 冲突检测依赖 `splitDotKey`
- whiteboard scene render 里有 `edge:${id}` 这种 tagged string，再反向 parse 回 `EdgeId`
- 查询执行 key 依赖 `JSON.stringify(...)`

这说明：

- 目前“字符串化”已经做了，但 codec 仍散落在上层，没有统一底层设施。

最终态必须是：

- shared 提供统一 key codec 设施。
- 至少覆盖三类：
  - tuple key
  - tagged key
  - dot path key

最终 API 形态：

```ts
const bucketKey = key.tuple(['fieldId', 'mode', 'interval'])
const sceneItemKey = key.tagged(['node', 'edge', 'mindmap', 'group'])
const mutationKey = key.path()
```

上层只声明结构，不再手写：

- `join('\u0000')`
- `edge:${id}`
- `splitDotKey`
- `JSON.stringify({...})` 作为稳定业务 key

`JSON.stringify` 可以保留给日志和调试，不能继续作为长期 canonical key codec。

### A8. projection family adapter 与 trace facade 仍由上层补

当前问题：

- `whiteboard-editor-scene/src/runtime/model.ts` 自己写 `createStableMapFamilyRead` / `createStableFamilyRead`
- dataview active projection runtime 自己包 trace 生成
- index projection / active projection 继续写 projection facade

最终态必须是：

- `@shared/projection` 提供标准 family adapter：
  - `projection.family.map(...)`
  - `projection.family.snapshot(...)`
  - `projection.family.entityDelta(...)`
- `@shared/projection` 提供 update 后 trace / capture hook，不再要求上层自己包 runtime facade

### A9. alias / facade / 中间层仍然偏多

典型位置：

- `dataview/packages/dataview-core/src/operations/trace.ts`
  - `export const trace = dataviewTrace`
- `dataview/packages/dataview-core/src/operations/issue.ts`
  - `createIssue`
  - `create = createIssue`
  - `issue = { create, hasErrors }`
- `dataview/packages/dataview-core/src/operations/compile.ts`
  - `compileIntents`
  - `compile = compileIntents`
- `whiteboard/packages/whiteboard-react/src/features/node/registry/compile.ts`
  - `compileReactNodeSpec`

这里的问题不是“功能错误”，而是：

- canonical API 不够明确
- wrapper 只是在搬运概念，没有新增长期价值
- 调用路径越长，越容易再次滋生过渡层

最终态必须是：

- 一个概念一个名字
- 一个运行时一个 constructor
- 一个 spec 一个 compile 结果
- 没有“同义别名导出”

### A10. `shared/core/store/table.ts` 可以进一步下沉为 projection family 底座

`shared/core/src/store/table.ts` 已经有 keyed subscription 与 patch apply 语义，但当前：

- whiteboard scene surface 还在自己维护 stable family read
- projection runtime 自己维护 family snapshot 比较
- 上层仍然使用裸 `Map` 加辅助函数

最终态不是让上层直接改成大量 `tableStore` 调用，而是：

- `@shared/projection` 的 family store 内部应建立在 `createTableStore` / `createFamilyStore` 之上
- 上层继续写 plain object projection spec
- family diff、keyed read、订阅通知、patch apply 全部由底层设施承担

## 最终 API 设计

### 1. `@shared/spec`

保留 root export，补强为两个 canonical 入口：

```ts
spec.table(table)
spec.tree(tree)
```

要求：

- `table(...)` 返回稳定的 key / entry / resolver / project 能力
- `tree(...)` 返回 leaf entry / path / key / prefix / parent 能力
- `shared/delta` 与 `shared/projection` 不再自己手写 leaf compiler

### 2. `@shared/delta`

只保留三类最终公开能力：

```ts
createDelta({ spec })
idDelta
entityDelta
```

要求：

- `createDelta` 是唯一的 change runtime 构造入口
- spec 为 plain object + 字符串 leaf
- id/set/value 类型映射只声明一次
- 不再对上层暴露“再组一层 helper”的必要性

### 3. `@shared/projection`

最终 root API：

```ts
createProjection({ ... })
projection.family.map(...)
projection.family.snapshot(...)
projection.scope(...)
```

要求：

- 不再要求上层书写超长 `ProjectionSpec<...>`
- family adapter 标准化
- scope 合并与 trace/capture 由 shared 承担
- projection runtime 内部复用 `shared/core/store/table.ts`

### 4. `@shared/mutation`

最终 root API：

```ts
createMutationEngine({
  reducer,
  compile,
  publish,
  history
})
createOperationReducer({ table, ... })
```

要求：

- compile loop 内建
- reducer dispatch 内建
- issue 收集 / stop / block / working doc apply 内建
- dataview / whiteboard 不再保留自己的 compile loop

### 5. `@shared/draft`

最终对上层的结构写入 API 必须支持：

```ts
record: {
  'data.widthMode': 'wrap',
  'style.fontSize': 20,
  'data.wrapWidth': undefined
}
```

要求：

- 上层不再使用 `mutationPath.of(...)`
- 上层不再使用 `compileDataUpdate(...)`
- 内部 path array 只留在 shared/draft

### 6. dataview

必须删除或吸收的局部实现：

- `operations/compile.ts` compile loop
- `operations/internal/compile/scope.ts`
- `operations/issue.ts` alias 层
- `operations/trace.ts` alias 层
- `active/index/bucket.ts` 中的 bucket spec key codec
- `active/plan.ts` 中本地 `createBucketSpec`
- `operations/key.ts` 中的 path parse codec

最终 dataview 只保留：

- 领域 intent handlers
- 领域 operation definitions
- 领域 field / view / calc 规则
- 基于 shared projection 的 active/index/document projection spec

### 7. whiteboard

必须删除或吸收的局部实现：

- `operations/compile.ts` compile loop
- `operations/compile-context.ts` 外层 compile ctx 包装
- `operations/compile-handlers.ts` cast wrapper
- `registry/schema.ts` 中 compileDataUpdate / compileStyleUpdate 这类 helper API
- `node/update.ts` 中 `as any` / `unknown` patch 回填
- `whiteboard-react` 的 `compileReactNodeSpec`
- `whiteboard-editor-scene` 的 family read adapter helper

最终 whiteboard 只保留：

- 领域 intent handlers / reducer definitions
- node / edge / mindmap / group 的领域规则
- editor scene 的 projection spec 本身

## 实施顺序

### Phase 1. 先做 shared/spec 与 shared key codec

必须完成：

- `spec.table`
- `spec.tree`
- shared key codec

完成标志：

- `shared/delta`
- `shared/projection`
- dataview bucket/index/key
- whiteboard scene item key

都统一基于这层，不再各写自己的 leaf compiler 和字符串 key 编码。

### Phase 2. 重写 `@shared/delta`

必须完成：

- 统一 delta constructor
- 去掉 `change<typeof spec, TConfig>(spec)` 这种双层装配
- 内部 leaf entry / path compiler 改用 `spec.tree`

### Phase 3. 重写 `@shared/projection`

必须完成：

- 推导式 `createProjection`
- family map / snapshot adapter
- scope merge 内建
- trace/capture hook 内建
- family store 内部接入 `shared/core/store/table.ts`

### Phase 4. 重写 `@shared/mutation`

必须完成：

- compile loop 下沉
- operation reducer constructor 下沉
- typed dispatch 消灭 `as never`

### Phase 5. dataview 接入 shared 最终态

必须完成：

- compile / issue / trace / key / bucket / index demand helper 收口
- projection runtime facade 收口
- 删除 alias 导出

### Phase 6. whiteboard 接入 shared 最终态

必须完成：

- compile loop / compile ctx / compile handlers 收口
- node schema update 结构化写入
- editor scene family adapter 收口
- react node spec compile 收口
- 删除 path helper 拼装

## 最终判定标准

全部完成后，必须同时满足：

1. shared 的公开 API 是“强底座”，不是“弱 primitives + 上层自拼装”。
2. dataview 与 whiteboard 对 shared 的使用，主要是声明 spec、plain object、字符串 key、callback，不再维护额外 compile/adapter/helper 系统。
3. 上层不再显式构造 path array，不再依赖 parse path、split key、`\u0000` 拼 key、`JSON.stringify` 业务 key。
4. 上层不再出现新的 `as never`、`as any`、`unknown -> domain type` 回填，除非确属用户输入或领域动态值。
5. alias / facade / compile wrapper / issue wrapper / trace wrapper 删除，只保留 canonical API。

## 一句话结论

当前实现离最终态还差最后一层：**不是再做局部优化，而是继续把“spec 编译、delta、projection、mutation compile、key codec、结构 patch”这几块彻底吸收到 shared，让 dataview 与 whiteboard 只写领域规则与 plain object spec。**
