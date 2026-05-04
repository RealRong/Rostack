# Collab 迁移到新 Mutation 的最终方案

## 1. 结论

这次迁移的本质，不是给 `shared/mutation` 补回旧的 collab helper，而是把 `shared/collab` 整体迁到新的 mutation 边界。

当前仓库里，`shared/mutation` 已经收敛到新的核心协议：

- 标准 `MutationWrite`
- 标准 `MutationChange`
- engine commit 直接携带 `change`
- 结构化 `target.scope + target.id`
- `nodeId: number`，不再依赖旧的字符串 path / targetId 拼接协议

而 `shared/collab` 仍然停留在旧协议上，继续从 `@shared/mutation` 读取这些已经不存在的导出：

- `SerializedMutationWrite`
- `createMutationConflictScopes`
- `deserializeMutationWrites`
- `mutationConflictScopesIntersect`
- `serializeMutationWrites`
- `MutationConflictScope`

所以现在的真实问题是：

- `shared/mutation` 新核心已经完成收敛
- `shared/collab` / `shared/collab-yjs` 还没有迁上去

## 2. 已确认的现状

### 2.1 `shared/collab` 当前直接编不过

运行：

```sh
pnpm --filter @shared/collab typecheck
```

会报缺失导出错误，证明 `shared/collab` 仍然绑定旧 mutation 协议。

核心断点文件：

- [shared/collab/src/session.ts](/Users/realrong/Rostack/shared/collab/src/session.ts:1)

### 2.2 新的 mutation 核心已经不是旧接口

新的 `MutationWrite` 已经是结构化协议：

- [shared/mutation/src/writer/writes.ts](/Users/realrong/Rostack/shared/mutation/src/writer/writes.ts:15)

新的 engine commit 已经携带 `change`：

- [shared/mutation/src/runtime/createEngine.ts](/Users/realrong/Rostack/shared/mutation/src/runtime/createEngine.ts:41)

`shared/mutation` 的导出也已经没有旧 collab helper：

- [shared/mutation/src/index.ts](/Users/realrong/Rostack/shared/mutation/src/index.ts:1)

### 2.3 计划文档之间存在边界冲突，但当前代码方向已经给出答案

较早的 collab 方案写的是：

- `shared/mutation` 负责 write codec
- `shared/mutation` 负责 conflict scope 推导

见：

- [SHARED_COLLAB_WRITES_FINAL_PLAN.zh-CN.md](/Users/realrong/Rostack/SHARED_COLLAB_WRITES_FINAL_PLAN.zh-CN.md:18)

而后续 schema API 方案明确改口：

- collab conflict scope 不放回 `shared/mutation`
- 它属于 collab/history 领域
- 序列化协议也归 collab

见：

- [SHARED_MUTATION_SCHEMA_FINAL_API_PLAN.zh-CN.md](/Users/realrong/Rostack/SHARED_MUTATION_SCHEMA_FINAL_API_PLAN.zh-CN.md:797)

本方案采用后者，原因很简单：

- 当前代码已经按这个方向演进
- `MutationWrite` 现在本身就是结构化写协议
- `commit.change` 已经存在，collab 可以基于它推导 history conflict
- 没有必要再把 collab 领域概念塞回 mutation core

## 3. 最终边界决策

### 3.1 `shared/mutation` 负责什么

- canonical `MutationWrite`
- canonical `MutationChange`
- `createMutationChange(schema, writes)`
- engine apply / replace / history / inverse
- schema 编译与 node id 稳定化

### 3.2 `shared/collab` 负责什么

- collab session 生命周期
- replay / checkpoint / cursor
- local collab history
- remote invalidation
- collab history scope 模型
- 基于 `MutationChange` 的冲突范围推导

### 3.3 `shared/collab-yjs` 负责什么

- Yjs transport
- bytes codec
- Yjs shared change / checkpoint 序列化
- wire payload 校验

### 3.4 业务层负责什么

- schema
- engine
- 空文档构造
- checkpoint 文档 decode / normalize
- UI 对接

业务层不应该继续拥有：

- 自己的 collab write codec
- 自己的 program codec
- 自己的 footprint / conflict scope 协议

## 4. 旧符号在新体系里的替代关系

旧体系里的几个符号，不是“换个地方继续 export”这么简单，而是职责迁移。

### 4.1 `SerializedMutationWrite`

旧语义：

- runtime write 和 wire write 不是同一个东西
- 需要一层 `SerializedMutationWrite`

新语义：

- 新 `MutationWrite` 已经是结构化的 plain data
- collab 不应该再依赖 mutation 内部的“第二套 write 类型”

最终替代：

```ts
type MutationCollabWrite = MutationWrite
```

建议做法：

- `shared/collab` 直接把 `MutationCollabChange.writes` 定义为 `readonly MutationWrite[]`
- 如果要强调 wire 边界，可以在 `shared/collab` 或 `shared/collab-yjs` 内部定义别名：

```ts
type MutationCollabWrite = MutationWrite
```

但它不应再由 `shared/mutation` 导出一个独立 serialized 类型。

### 4.2 `serializeMutationWrites` / `deserializeMutationWrites`

旧语义：

- runtime write 需要编码成可传输形态
- 远端再 decode 回 runtime write

新语义：

- `MutationWrite` 本身已经是结构化协议
- collab 只需要做 payload 校验，不需要做“语义重编码”

最终替代：

- 删除这两个 mutation helper
- `shared/collab-yjs` 直接 encode/decode `MutationWrite[]`
- decode 后直接 `engine.apply(writes, { origin: 'remote', history: false })`

### 4.3 `MutationConflictScope`

旧语义：

- mutation core 暴露一套通用 conflict scope

新语义：

- 这是 collab local history / remote invalidation 的领域概念
- 不应该留在 mutation core

最终替代：

```ts
type HistoryScope = ...
```

建议命名：

- `HistoryScope`
- `CollabHistoryScope`

不建议继续叫 `MutationConflictScope`，因为它会把 collab/history 概念伪装成 mutation core 通用概念。

### 4.4 `createMutationConflictScopes`

旧语义：

- 从 writes 直接推导冲突 scope

新语义：

- 优先从 `MutationChange` 推导 history scope

最终替代：

```ts
createHistoryScopes(change: MutationChange<TSchema>): readonly HistoryScope[]
```

对于 remote replay：

```ts
const change = createMutationChange(schema, writes)
const scopes = createHistoryScopes(change)
```

### 4.5 `mutationConflictScopesIntersect`

最终替代：

```ts
historyScopesIntersect(left: HistoryScope, right: HistoryScope): boolean
```

它属于 `shared/collab`。

## 5. 新协议建议

### 5.1 标准 shared change

最终 shared change 建议直接变成：

```ts
type MutationCollabChange = {
  id: string
  actorId: string
  writes: readonly MutationWrite[]
}
```

这意味着：

- `shared/collab/src/session.ts` 不再 import `SerializedMutationWrite`
- `shared/collab-yjs/src/session.ts` 不再校验 `schemaNodeId`
- shared log 直接记录新的 canonical writes

### 5.2 history scope 来源

本地提交：

```ts
const scopes = createHistoryScopes(commit.change)
```

远端变更：

```ts
const change = createMutationChange(schema, writes)
const scopes = createHistoryScopes(change)
```

### 5.3 replace / checkpoint 的语义

`replace` 和 checkpoint rotation 不应该继续尝试做细粒度冲突判断。

最终策略：

- remote `replace` / reset：直接清空 local collab history
- checkpoint rotation：只影响 replay 基线，不制造新的业务冲突协议

## 6. 需要重构的包与文件

## 6.1 `shared/collab`

### 必改文件

- [shared/collab/src/session.ts](/Users/realrong/Rostack/shared/collab/src/session.ts:1)
- [shared/collab/src/index.ts](/Users/realrong/Rostack/shared/collab/src/index.ts:1)
- [shared/collab/test/collab.test.ts](/Users/realrong/Rostack/shared/collab/test/collab.test.ts:1)

### 应新增文件

- `shared/collab/src/historyScope.ts`
- `shared/collab/src/writeCodec.ts` 或 `shared/collab/src/wire.ts`

说明：

- `writeCodec.ts` 在这里不是“转换成另一种 write 结构”，而是 collab 对 wire payload 的边界校验与 decode/encode 包壳
- 如果决定直接在 `shared/collab-yjs` 做校验，这个文件可以不建
- `historyScope.ts` 则基本是必须的，因为冲突范围已经不应留在 mutation core

### 可以基本不动的文件

- [shared/collab/src/replay.ts](/Users/realrong/Rostack/shared/collab/src/replay.ts:1)

`replay.ts` 的 cursor / append / reset 规划是泛型的，不依赖旧 mutation helper，基本可以保留。

## 6.2 `shared/collab-yjs`

### 必改文件

- [shared/collab-yjs/src/session.ts](/Users/realrong/Rostack/shared/collab-yjs/src/session.ts:1)
- [shared/collab-yjs/src/index.ts](/Users/realrong/Rostack/shared/collab-yjs/src/index.ts:1)

### 基本不动的文件

- [shared/collab-yjs/src/store.ts](/Users/realrong/Rostack/shared/collab-yjs/src/store.ts:1)
- [shared/collab-yjs/src/transport.ts](/Users/realrong/Rostack/shared/collab-yjs/src/transport.ts:1)

说明：

- `store.ts` / `transport.ts` 是泛型存储和 transport 壳，不依赖旧 `SerializedMutationWrite`
- 真正绑定旧 write 协议的是 `session.ts`

## 6.3 `whiteboard`

### 联动文件

- [whiteboard/packages/whiteboard-react/src/runtime/whiteboard/useWhiteboardCollab.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/runtime/whiteboard/useWhiteboardCollab.ts:1)
- [whiteboard/packages/whiteboard-react/src/types/common/collab.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/types/common/collab.ts:1)

说明：

- whiteboard 已经直接接 `createYjsMutationCollabSession()`
- 所以协议迁移的核心不在 whiteboard
- whiteboard 主要是跟随 shared 层 API 调整类型
- 当前 `localHistory -> historySource` 的桥接逻辑可以保留

### 不需要改协议的部分

- presence 绑定
- whiteboard UI 层 collab 状态消费

## 6.4 `dataview`

### 联动文件

- [dataview/packages/dataview-react/src/dataview/provider.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/dataview/provider.tsx:1)
- [dataview/packages/dataview-react/src/dataview/types.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/dataview/types.ts:1)

说明：

- dataview 也已经直接接 `createYjsMutationCollabSession()`
- 所以协议迁移的核心也不在 dataview
- 主要是跟随 `@shared/collab` / `@shared/collab-yjs` 的类型变更

## 7. `shared/collab/src/session.ts` 里的具体替换点

这是本次迁移的主战场。

### 7.1 import 层

当前文件还在 import：

- `SerializedMutationWrite`
- `createMutationConflictScopes`
- `deserializeMutationWrites`
- `mutationConflictScopesIntersect`
- `serializeMutationWrites`
- `MutationConflictScope`

这些都要删掉。

应替换成：

- `MutationWrite`
- `MutationChange`
- `createMutationChange`

以及 collab 自己的新 helper：

- `createHistoryScopes`
- `historyScopesIntersect`

### 7.2 shared change 类型

当前：

```ts
type MutationCollabChange = {
  id: string
  actorId: string
  writes: readonly SerializedMutationWrite[]
}
```

应改为：

```ts
type MutationCollabChange = {
  id: string
  actorId: string
  writes: readonly MutationWrite[]
}
```

### 7.3 本地历史 entry

当前 `scopes` 依赖 `MutationConflictScope[]`。

应改为：

```ts
scopes: readonly HistoryScope[]
```

并且 capture local commit 时不再从 `commit.writes` 直接拿 mutation helper，而是从 `commit.change` 推导。

### 7.4 remote invalidation

当前逻辑是：

- decode serialized writes
- apply
- `createMutationConflictScopes(writes)`
- 与本地 entry scopes 做 intersect

应改为：

- 读取 `MutationWrite[]`
- `engine.apply(writes, { origin: 'remote', history: false })`
- `createMutationChange(schema, writes)`
- `createHistoryScopes(change)`
- 与本地 `HistoryScope[]` 做 `historyScopesIntersect`

### 7.5 publish path

当前 publish commit 时还会：

```ts
writes: serializeMutationWrites(commit.writes)
```

应改为：

```ts
writes: commit.writes
```

或者做一层 collab-local sanitize：

```ts
writes: encodeMutationCollabWrites(commit.writes)
```

但 encode 的结果仍然应保持 canonical write 形态，而不是回到旧 serialized type。

## 8. `shared/collab-yjs/src/session.ts` 的具体替换点

### 8.1 删除旧断言

当前 `assertSerializedWrites()` 还在校验：

- `entry.kind`
- `entry.schemaNodeId`

见：

- [shared/collab-yjs/src/session.ts](/Users/realrong/Rostack/shared/collab-yjs/src/session.ts:36)

这已经和新 `MutationWrite` 不匹配。

### 8.2 新的校验目标

新的 codec 应校验：

- `kind` 为 string
- `nodeId` 为 number
- `target` 若存在，则：
  - `scope` 为 `readonly string[]`
  - `id` 为 string
- 针对各 write kind 校验各自必需字段

建议这里做完整的 exhaustive validator，不做半吊子“只看 kind”校验。

### 8.3 Yjs codec 的最终职责

- `encodeChange`: `MutationCollabChange -> Uint8Array`
- `decodeChange`: `Uint8Array -> MutationCollabChange`
- 不做 mutation 语义转换
- 只做 JSON bytes 编解码和 wire payload 校验

## 9. 推荐新增的 `HistoryScope` 设计

这个设计不需要回到 mutation core。

建议直接在 `shared/collab` 内定义，例如：

```ts
type HistoryScope =
  | { kind: 'document' }
  | { kind: 'entity-existence'; nodeId: number; target: { scope: readonly string[]; id: string } }
  | { kind: 'field'; nodeId: number; target?: { scope: readonly string[]; id: string } }
  | { kind: 'dictionary'; nodeId: number; target?: { scope: readonly string[]; id: string } }
  | { kind: 'sequence'; nodeId: number; target?: { scope: readonly string[]; id: string } }
  | { kind: 'tree'; nodeId: number; target?: { scope: readonly string[]; id: string } }
```

再基于 `MutationChange` 建立从 change node 到 history scope 的映射。

关键点：

- scope 的目的是 local undo/redo invalidation
- 不是用来决定共享文档最终收敛
- shared state 的收敛仍然靠 canonical log order + missing target reject

## 10. 不建议的路线

### 10.1 不建议把旧 helper 补回 `shared/mutation`

原因：

- 这会把 collab/history 领域概念重新塞回 mutation core
- 会制造“mutation 还负责协作 wire 协议”的边界倒退
- 和后续 schema API 计划冲突

### 10.2 不建议继续保留 `SerializedMutationWrite`

原因：

- 新 `MutationWrite` 已经不是 runtime node 引用
- 再保留 serialized write 只会重复建模
- 会让 collab 继续绑在旧兼容层上

### 10.3 不建议做双轨兼容

例如：

- 同时支持 `SerializedMutationWrite[]`
- 同时支持 `MutationWrite[]`
- 同时支持旧 `MutationConflictScope`
- 同时支持新 `HistoryScope`

这会显著拖长 shared 层收敛时间。

如果不考虑成本，最优路线就是：

- 直接删旧协议
- 直接改 shared/collab
- 直接改 shared/collab-yjs
- 业务层只做薄联动

## 11. 最终迁移顺序

### Phase 1

重写 `shared/collab` 的边界定义：

- 定义 `MutationCollabChange.writes = MutationWrite[]`
- 新建 `HistoryScope`
- 新建 `createHistoryScopes()` / `historyScopesIntersect()`

### Phase 2

重写 `shared/collab/src/session.ts`：

- 删除旧 mutation helper 依赖
- publish 直接发 canonical writes
- replay 直接 apply canonical writes
- remote invalidation 改用 `createMutationChange() + createHistoryScopes()`

### Phase 3

重写 `shared/collab-yjs/src/session.ts`：

- 删除 `SerializedMutationWrite` 依赖
- 改成 canonical writes 的 encode/decode
- 做完整 wire validator

### Phase 4

重写 `shared/collab/test/collab.test.ts`：

- 覆盖 local publish
- 覆盖 remote replay
- 覆盖 remote conflict invalidation
- 覆盖 non-conflicting remote write
- 覆盖 replace/reset 清空 local history
- 覆盖 duplicate / rejected diagnostics

### Phase 5

联动 `whiteboard` / `dataview`：

- 跟随新的 shared API 调整类型
- 验证现有 provider / hook 仍正常消费 session

## 12. 最终判断

如果只回答一句话：

collab 迁到新的 mutation，上策不是恢复 `createMutationConflictScopes`、`serializeMutationWrites` 这些旧导出，而是承认它们已经不属于 `shared/mutation` 了，然后把 `shared/collab` 改成直接消费新的 canonical `MutationWrite` 和 `MutationChange`。

最终形态应该是：

- `shared/mutation` 负责 `MutationWrite` / `MutationChange` / engine
- `shared/collab` 负责 history scope / replay / local collab history
- `shared/collab-yjs` 负责 wire codec / transport
- `whiteboard` / `dataview` 只做薄接入
