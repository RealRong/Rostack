# Dataview Engine Helper 中轴化重构方案

## 1. 文档目标

本文针对 `dataview/packages/dataview-engine/src` 的 helper 使用情况做一次全局盘点，目标不是修某一个局部，而是回答四个长期问题：

1. 哪些 helper 只是健康的叶子级复用。
2. 哪些 helper 已经在主导流程，导致业务逻辑被 helper 绑架。
3. 全 engine 的长期最优中轴应该怎么设计，才能同时做到简单、可复用、复杂度低。
4. 在继续收缩概念以后，哪些东西应该成为共享基础轴，哪些东西只能保留为阶段语义壳。

本文结论先写在前面：

1. 不应该做一个全局 `EngineScope`。
2. 共享基础中轴应该只有两个：
   - 读中轴：`DocumentReader`
   - 写中轴：单一 `dispatch`；如果需要类型名，只给一个极薄的 `EngineWriter`
3. `PlannerScope` 和 `ActiveViewContext` 都不应该再各自长出本地 `reader.*` / `write.*` 子树。
4. `PlannerScope` 应该收缩为 planner 专属语义壳。
5. `ActiveViewContext` 应该收缩为 active 专属语义壳。
6. core 层的 `filter.add`、`sort.clear`、`group.setMode` 这类东西不应再被称为 helper，而应收敛成命名空间化、短命名的领域状态变换 API。
7. 这些领域状态变换 API 的统一命名与 no-op 语义，也属于本次重构必须一起完成的范围，不能后置。
8. 已经相对健康、应该保留并继续强化的结构是：
   - `CommitImpact`
   - selector 分层
   - `runSnapshotStage`
   - `runtime/history.ts`

换句话说，长期最优不是“一个大 scope 吃掉整个 engine”，也不是“每个阶段自己复制一套 reader/write 子系统”，而是“共享读写基础轴 + 各阶段最薄语义壳”。

## 2. 调研范围与热点

本次调研覆盖：

- `src/mutate`
- `src/active`
- `src/api`
- `src/runtime`

helper / shared 模块热点计数如下：

| 模块 | 引用文件数 |
| --- | ---: |
| `@shared/core` | 31 |
| `@dataview/core/document` | 18 |
| `@dataview/engine/mutate/issues` | 9 |
| `@dataview/engine/active/index/shared` | 8 |
| `@dataview/engine/active/commands/shared` | 7 |
| `@dataview/engine/mutate/planner/shared` | 4 |
| `@dataview/engine/mutate/validate/entity` | 4 |
| `@dataview/engine/mutate/validate/target` | 1 |

底层 document 读取 helper 的横向扩散也很明显：

| 读取函数 | 全 engine 出现次数 |
| --- | ---: |
| `getDocumentFieldById` | 29 |
| `getDocumentViewById` | 12 |
| `getDocumentRecordById` | 6 |

这个分布说明了三件事：

1. `@shared/core` 和 `@dataview/core/document` 这种叶子级 helper 本身不是问题，它们主要承担基础值操作和底层读取。
2. 真正的问题在 planner 和 active commands 里，那些把读取、校验、报错、结果收束拆成多个 helper 再手动拼起来的流程 helper，已经在主导控制流。
3. engine 缺的不是更多 helper，而是更明确的共享基础轴与阶段语义边界。

## 3. Helper 的分类标准

不是所有 helper 都该被消灭。长期最优的前提不是“禁 helper”，而是只允许 helper 停留在叶子层，不允许 helper 成为流程入口。

### 3.1 可以保留的 helper

下面这些属于健康的叶子级 helper，可以保留：

1. 纯值变换。
   - 例如 `unique`、`sameOrder`、`trimToUndefined`
2. 纯结构读取。
   - 例如 `getDocumentFieldById`
3. 纯状态变换。
   - 例如 `clearRedo`、`pushUndo`、`takeUndo`
4. 纯候选值校验。
   - 例如“给我一个字段候选值，我只判断它是否合法”
5. 纯 operation 构造。
   - 仅当它确实比直接写 object literal 更清晰，否则应当直接内联

### 3.2 需要被正式提升为 API 的领域状态变换

像下面这类东西，从架构属性上看是健康的，但它们不应该继续被表述成“helper”，而应该被提升为 core 层正式 API：

1. `addFilterRule`
2. `clearSorters`
3. `setGroupMode`
4. `setSearchQuery`

它们的共同点是：

1. 只接收领域状态，返回下一个领域状态。
2. 不读 store。
3. 不 dispatch。
4. 不产 issue。
5. 不决定流程走向。

这类东西的长期最优形态不是自由函数名，而是命名空间化、短命名的领域状态变换 API，例如：

1. `filter.add`
2. `sort.clear`
3. `group.setMode`
4. `search.set`

所以它们应该被视为“领域状态变换 API”，而不是“散落的 helper”。

### 3.3 不应该继续作为公共 helper 扩散的东西

下面这些一旦被做成散落的 helper，就会绑架流程：

1. 负责“读 + 判空 + 产 issue + 决定是否继续”的 helper
2. 负责“汇总 issues，再决定是否吞掉 operations”的 helper
3. 负责“读当前 view / field，再 commit patch”的 helper
4. 负责“根据 action/index 生成 source，再到处传递”的 helper
5. 任何跨多个业务函数广泛传播、并且携带阶段语义的 helper

这类东西不应该以自由函数形式散落在各个文件里，它们应该进入对应阶段的语义壳。

## 4. 现状盘点：哪些地方已经被 helper 绑架流程

### 4.1 Planner 是当前最明显的重灾区

问题最集中的文件是：

- `src/mutate/planner/views.ts`
- `src/mutate/planner/fields.ts`
- `src/mutate/planner/records.ts`
- `src/mutate/planner/index.ts`

当前 lowerer 的普遍模式是：

1. `sourceOf(index, action)`
2. `validateXxxExists(document, source, id)`
3. `getDocumentXxxById(document, id)`
4. `createIssue(...)`
5. `planResult(issues, operations)`

这套模式的问题不是“调用 helper 太多”，而是业务流程被拆散到多个 helper 里：

1. existence 语义被重复表达。
   - 先 `validateViewExists(...)`
   - 再 `getDocumentViewById(...)`
2. planner 的阶段语义没有被收敛到一个中心。
   - issue source 在 `sourceOf`
   - issue 构造在 `createIssue`
   - existence 校验在 `validate/entity.ts`
   - target 校验在 `validate/target.ts`
   - 最终收束在 `planResult`
3. lowerer 读起来像是在拼 helper，而不是在表达业务意图。
4. 一旦以后 planner 想统一加 trace、统一加 debug 上下文、统一切换 issue 产出规则，就必须改一串 helper 链。

### 4.2 Active commands 也被 helper 层拽着走

`src/active/commands/shared.ts` 里的：

- `withViewPatch`
- `withFieldPatch`
- `withFilterFieldPatch`
- `withGroupFieldPatch`

本质上不是“值 helper”，而是 active command 阶段的编排 helper。

它们把下面这条流程封装成了自由函数：

1. 读当前 active view
2. 可选读取 field / filter field / group field
3. 生成 patch
4. 触发写入

问题在于：

1. 这不是通用 helper，这是 active 阶段自己的流程语义。
2. command 文件现在不是只依赖 `ActiveViewContext`，而是依赖 `ActiveViewContext + shared helper` 的组合体。
3. 一旦 active 阶段以后想加入 trace、patch collapse、silent mode、validation hook、或者 batch，这些能力就会继续挂在 helper 上，而不是挂在单一中轴上。

### 4.3 API 层不是最严重，但也有重复流程

`src/api/views.ts`、`src/api/fields.ts`、`src/api/records.ts` 里有很多下面这种模式：

1. 读当前实体
2. `dispatch(...)`
3. 再读一次实体
4. 推导返回值

这层的问题和 planner 不完全一样：

1. 它没有那么重的 helper 链问题。
2. 它更多是“读入口分散，写后回读分散”。
3. 它本身是 public facade，允许保留少量薄重复。

所以 API 层不需要再发明一个重量级中轴；它只需要共享读入口和共享写入口。

### 4.4 Active runtime / snapshot / index 存在大量底层读取散点

这些文件里直接使用 `getDocumentFieldById` / `getDocumentViewById` 的情况很多：

- `src/active/demand.ts`
- `src/active/read.ts`
- `src/active/context.ts`
- `src/active/index/sort.ts`
- `src/active/index/calculations.ts`
- `src/active/index/group/bucket.ts`
- `src/active/index/group/runtime.ts`
- `src/active/snapshot/base.ts`
- `src/active/snapshot/runtime.ts`
- `src/active/snapshot/query/derive.ts`

这里的问题和 planner 不同：

1. 它们大多不是被 helper 绑架控制流。
2. 它们的问题是共享读入口不存在，所以每个阶段都在自己拼 document 读取方式。

这意味着 engine 确实需要共享中轴，但共享中轴应该是读写基础轴，而不是任意阶段的业务 scope。

### 4.5 目前已经相对健康的结构

下面这些模块的方向基本是对的，不应该被一个大而全的 engine scope 覆盖掉：

1. selector 分层
   - `src/runtime/selectors/core.ts`
   - `src/runtime/selectors/document.ts`
   - `src/runtime/selectors/active.ts`
   - `src/api/documentSelect.ts`
2. snapshot stage runner
   - `src/active/snapshot/stage.ts`
3. history 状态变换
   - `src/runtime/history.ts`
4. `CommitImpact` 驱动的写后影响表达
5. `active/index/shared.ts` 这类以值变换和 impact 衍生为主的叶子级 shared
6. `filter` / `sort` / `group` / `search` 这类 core 领域状态变换函数
   - 方向是健康的
   - 但命名与 no-op 语义还没有完全收敛

这些模块的共同点是：

1. 它们提供的是明确的单一职责入口。
2. 它们没有把阶段流程拆成一串离散 helper。
3. 它们更接近“阶段入口”或“基础设施”，而不是“helper 拼装器”。
4. 其中 `filter` / `sort` / `group` / `search` 应继续收敛成正式的领域状态变换 API。

## 5. 核心判断：什么该共享，什么不该共享

### 5.1 为什么不应该做一个全局 `EngineScope`

表面上看，一个全局 `EngineScope` 好像能解决“helper 到处飞”的问题，但长期会更糟，因为它会把不同阶段的语义强行揉进一个对象里。

不同阶段的状态模型根本不同：

1. planner 面对的是 action lowering 上下文。
2. active commands 面对的是 active view 上下文和写入入口。
3. snapshot 面对的是 derive/publish 生命周期。
4. selector 面对的是响应式 store 读取。
5. commit 面对的是 operation 执行与 impact 产出。

这些阶段之间并不共享同一种 scope 语义。

### 5.2 为什么不能让每个阶段自己复制一套 `reader.* / write.*`

这次继续收缩以后，另一个关键判断是：

1. 不仅不能做全局 `EngineScope`
2. 也不能让 `PlannerScope` 和 `ActiveViewContext` 各自再长出一棵本地 `reader.* / write.*`

原因很简单：

1. 共享读能力如果被复制成多套本地 reader tree，就会重新分叉 API。
2. 共享写能力如果被复制成多套本地 write tree，就会重新分叉写入口。
3. 一旦每个阶段都长出自己的树，helper bus 只是换了一个名字继续存在。

### 5.3 真正值得全局收敛的公共能力只有两类

从全局复用角度看，真正值得收敛成共享基础轴的只有两类：

1. 给我统一的 document / record / field / view 读取入口
2. 给我唯一的写入入口，而不是每个阶段再发明自己的 `commit` / `write` / `apply`

这对应的是：

1. `DocumentReader`
2. 单一 `dispatch`；如果需要名字，只给一个极薄的 `EngineWriter`

除此之外，其他能力都更适合作为阶段语义壳存在，而不是上升为全 engine 共享中轴。

## 6. 长期最优中轴设计

长期最优结构应该是：

1. 一个共享的、非常薄的 `DocumentReader`
2. 一个共享的、唯一的写入入口 `dispatch`
3. 若干个阶段级语义壳
4. 保留已经健康的阶段入口，不额外套一层

可以抽象成下面这个结构：

```text
DataDoc / RuntimeStore
  -> DocumentReader            共享读中轴
  -> dispatch                 共享写中轴
  -> PlannerScope             planner 语义壳
  -> ActiveViewContext        active 语义壳
  -> Selector Stack           runtime/public 读中轴
  -> runSnapshotStage         snapshot 阶段入口
  -> CommitImpact             commit 写后影响中轴
```

### 6.1 共享读中轴：`DocumentReader`

`DocumentReader` 是整个方案里最核心的共享中轴之一。

它的责任必须保持极窄：

1. 提供统一 document / record / field / view 读取入口
2. 提供统一 `get / has / ids / list` 访问方式
3. 不负责 issue
4. 不负责 validation result
5. 不负责 dispatch
6. 不负责 commit
7. 不负责 planner / active / snapshot 特有语义

推荐最终 API：

```ts
interface EntityReader<TId extends string, TEntity> {
  ids(): readonly TId[]
  list(): readonly TEntity[]
  get(id: TId): TEntity | undefined
  has(id: TId): boolean
}

interface DocumentReader {
  document(): DataDoc

  records: EntityReader<RecordId, DataRecord>
  fields: EntityReader<FieldId, Field>
  views: EntityReader<ViewId, View> & {
    activeId(): ViewId | undefined
    active(): View | undefined
  }
}
```

工厂也应该保持简单，只保留两类：

```ts
declare function createStaticDocumentReader(document: DataDoc): DocumentReader
declare function createLiveDocumentReader(readDocument: () => DataDoc): DocumentReader
```

这里不需要更多抽象。一个接口，两种来源，就够了。

#### 为什么 `DocumentReader` 仍然保留 namespace 风格

因为它是共享读中轴，不是工具箱。

namespace 风格的好处是：

1. `reader.records.get(id)`、`reader.fields.has(id)` 语义清晰
2. record / field / view 能力天然分组
3. API 可控，后续新增 `views.active()` 不会继续污染自由函数空间
4. 能直接替代大量散落的 `getDocumentXxxById` 调用点

### 6.2 共享写中轴：`dispatch` / `EngineWriter`

共享写中轴不应该再被包成各阶段自己的 `write.*` 命名空间。

长期最优做法是直接承认 engine 里只有一个写入口：`dispatch`。

如果需要一个类型名，可以给它一个极薄的定义，但不要再长方法树：

```ts
type EngineWriter = (
  action: Action | readonly Action[]
) => ActionResult
```

这里的关键点不是要不要包一层对象，而是：

1. engine 里只能有一个共享写入口
2. 这个入口不应该继续长出 `viewPatch()`、`fieldPatch()`、`groupPatch()` 之类的领域方法
3. 阶段语义壳如果要做便捷写入，也只能在本地做极薄封装，并且最终回到这个单一入口

如果按“概念最少”来定，最终甚至不需要 `EngineWriter` 这个对象名，直接保留裸 `dispatch` 就够了。

### 6.3 领域状态变换 API：命名空间 + 短命名

在 `DocumentReader` 和 `dispatch` 之外，还有一类非常重要但不应被混进阶段语义壳的东西：core 层领域状态变换 API。

这类 API 的定位是：

1. 它们不是流程中轴。
2. 它们不是写入中轴。
3. 它们不是 helper 集合。
4. 它们是某个领域状态的标准变换入口。

最优设计要求如下：

1. 放在 `dataview-core`，而不是 `dataview-engine`。
2. 按领域命名空间组织，而不是自由函数散落。
3. API 名尽量短，让调用处看起来像领域语言。
4. 只做纯状态变换，不混入读取、dispatch、issue、trace。
5. no-op 必须统一返回原引用，不要无意义 clone。

推荐的命名方式如下：

```ts
filter.add(filter, field)
filter.replace(filter, index, rule)
filter.setPreset(filter, index, field, presetId)
filter.setValue(filter, index, field, value)
filter.setMode(filter, mode)
filter.remove(filter, index)
filter.clear(filter)

sort.add(sorters, fieldId, direction)
sort.set(sorters, fieldId, direction)
sort.keepOnly(sorters, fieldId, direction)
sort.replace(sorters, index, sorter)
sort.remove(sorters, index)
sort.move(sorters, from, to)
sort.clear(sorters)

group.set(group, field)
group.clear(group)
group.toggle(group, field)
group.setMode(group, field, mode)
group.setSort(group, field, sort)
group.setInterval(group, field, interval)
group.setShowEmpty(group, field, value)

search.set(search, value)
```

对应地，当前这类名字都应该被消化掉，不保留兼容层：

1. `addFilterRule` -> `filter.add`
2. `replaceFilterRule` -> `filter.replace`
3. `setFilterPreset` -> `filter.setPreset`
4. `setFilterValue` -> `filter.setValue`
5. `setFilterMode` -> `filter.setMode`
6. `removeFilterRule` -> `filter.remove`
7. `clearSorters` -> `sort.clear`
8. `addSorter` -> `sort.add`
9. `setSorter` -> `sort.set`
10. `setOnlySorter` -> `sort.keepOnly`
11. `replaceSorter` -> `sort.replace`
12. `removeSorter` -> `sort.remove`
13. `moveSorter` -> `sort.move`
14. `setGroupMode` -> `group.setMode`
15. `setSearchQuery` -> `search.set`

这类 API 的实现约束也必须写死：

1. 输入不变，输出新值或原引用。
2. 没变化时返回原引用，而不是 clone 后返回“新对象”。
3. 不做跨领域读取。
4. 不做副作用。
5. 不关心 engine 阶段语义。

这一步非常重要，因为如果 core 层领域变换 API 的命名和 no-op 语义不统一，上层再怎么收轴，最终仍然会在调用面上继续泄露杂乱概念。

### 6.4 Planner 语义壳：`PlannerScope`

`PlannerScope` 不是全 engine 共享中轴，它只属于 planner。

它的责任是把现在散落在下面这些 helper 里的 planner 语义收拢起来：

- `sourceOf`
- `planResult`
- `validateRecordExists`
- `validateFieldExists`
- `validateViewExists`
- target 解析里与 planner issue 相关的那部分逻辑
- `createIssue` 的 planner 使用方式

但它不应该再复制一套本地 reader namespace，例如 `records.get / fields.get / views.get`。这些都应该直接回到共享 `DocumentReader`。

推荐最终 API：

```ts
interface PlannerScope {
  readonly reader: DocumentReader

  issue(
    code: ValidationCode,
    message: string,
    path?: string,
    severity?: 'error' | 'warning'
  ): void

  require<T>(
    value: T | undefined,
    input: {
      code: ValidationCode
      message: string
      path?: string
      severity?: 'error' | 'warning'
    }
  ): T | undefined

  resolveTarget(
    target: EditTarget,
    path?: string
  ): readonly RecordId[] | undefined

  finish(...operations: readonly DocumentOperation[]): PlannedActionResult
}
```

lowerer 的最终目标应该是直接表达业务，而不是拼 helper。例如 `view.open` 应该收敛到：

```ts
const lowerViewOpen = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'view.open' }>
): PlannedActionResult => {
  const view = scope.require(
    scope.reader.views.get(action.viewId),
    {
      code: 'view.notFound',
      message: `Unknown view: ${action.viewId}`,
      path: 'viewId'
    }
  )
  if (!view) {
    return scope.finish()
  }

  return scope.finish({
    type: 'document.activeView.set',
    viewId: view.id
  })
}
```

这段代码的关键价值不是“少写几行”，而是：

1. existence 语义只写一次
2. issue source 不再手动传播
3. result 收束规则不再散落
4. lowerer 只表达业务意图

#### `PlannerScope` 应该吸收什么

应该吸收：

1. issue source 生成
2. entity existence 校验
3. edit target 解析
4. 统一 finish / early-return 规则

不应该吸收：

1. `normalizeView(...)`
2. `applyViewPatch(...)`
3. `createFieldConvertPatch(...)`
4. 纯 domain transform
5. 纯候选值校验

继续收缩后的关键原则是：

1. `PlannerScope` 保留 `reader`，但不再复制 `records/fields/views` 本地树
2. planner lowerer 直接使用 `scope.reader.*`
3. planner 语义只保留 `issue / require / resolveTarget / finish`

### 6.5 Active 语义壳：收缩 `ActiveViewContext`

`active/commands/shared.ts` 这层应该删掉，active command 只能直接依赖一个 stage axis。

推荐方向不是再新建一个 helper 层，也不是把它扩成一棵 `write.*` 树，而是：

1. 共享写入口直接回到 `dispatch`
2. `ActiveViewContext` 只保留 active view 特有语义
3. active 需要的 field / filter field / group field 查找，一律经由共享 `DocumentReader`

推荐最终 API：

```ts
interface ActiveViewContext {
  reader: DocumentReader
  dispatch: EngineWriter
  view(): View | undefined
  state(): ViewState | undefined
  patch(
    resolve: (view: View, reader: DocumentReader) => ViewPatch | undefined
  ): boolean
}
```

这样 active command 层最终就只会写成：

```ts
base.patch(view => ({
  sort: sort.clear(view.sort)
}))

base.patch((view, reader) => {
  const field = reader.fields.get(fieldId)
  return field
    ? {
        filter: filter.add(view.filter, field)
      }
    : undefined
})
```

这样做的好处是：

1. 共享写入口不会再被 active 本地私有化
2. `active/commands/shared.ts` 可以彻底删除
3. command 文件不再依赖“context + helper 组合体”
4. `ActiveViewContext` 只保留 active view 语义，不再自带一棵局部 `reader.* / write.*`
5. 以后如果要加 tracing、patch collapse、silent commit、或者批量 patch，只改共享 `dispatch` 或薄 `patch(...)` 壳，不改所有 command

这里要特别强调：

1. `dispatch` 才是共享写中轴
2. `patch(...)` 不是共享写中轴，它只是 active 阶段的一个薄语义 helper
3. 如果将来连 `patch(...)` 都嫌重，也可以继续收缩到只保留 `dispatch + view() + reader`

### 6.6 Selector 继续保持为读侧中轴

当前 selector 分层基本是对的：

- `runtime/selectors/core.ts`
- `runtime/selectors/document.ts`
- `runtime/selectors/active.ts`
- `api/documentSelect.ts`

长期方案不是推翻它，而是把它明确为“响应式读中轴”。

这里要区分两种读：

1. `DocumentReader`
   - 同步读取
   - 用于 planner / active / snapshot / imperative api
2. selector stack
   - 响应式读取
   - 用于 runtime store 派生和 public select api

这两者不是二选一，也不应该强行合并。

### 6.7 Snapshot 与 Commit 维持阶段入口，不再额外套层

`runSnapshotStage` 已经是很好的阶段入口，应该保留。

`CommitImpact` 也是当前写入线里最应该保留的中轴表达，因为它表达的是“commit 之后到底影响了什么”，而不是一串临时 helper。

因此长期结构应该是：

1. snapshot 继续围绕 `runSnapshotStage`
2. commit 继续围绕 `CommitImpact`
3. 不要再引入一个把 snapshot / commit / planner 都包起来的大 scope

### 6.8 API 层保持薄 facade，不再引入新 helper 总线

public API 层的长期目标应该是：

1. 用 selector stack 处理响应式读
2. 用 `DocumentReader` 处理必要的即时读取
3. 用共享 `dispatch` 做写入
4. 允许保留少量 facade 级薄逻辑

不建议为 API 层再引入一个大而全的 `ApiScope` 或 `MutationScope`，因为这会把 public facade 也拖进一套中间层。

如果确实需要复用“写后回读”的模式，也应该只在 API 包内做一个非常薄的本地抽象，而不是上升成 engine 级中轴。

## 7. 哪些需要删除，哪些需要保留

### 7.1 应该删除的东西

#### A. planner 编排 helper

应该删除或彻底收编进 `PlannerScope`：

- `src/mutate/planner/shared.ts`
  - `planResult`
  - `sourceOf`
  - `listTargetRecordIds`
- `src/mutate/validate/entity.ts`
  - `validateRecordExists`
  - `validateFieldExists`
  - `validateViewExists`
- `src/mutate/validate/target.ts`
  - 其中负责 target existence / planner issue 传播的逻辑

这些能力不应该再作为 lowerer 可自由导入的 helper。

#### B. active command 编排 helper

应该直接删除：

- `src/active/commands/shared.ts`

它的能力不应该并入一棵新的 `ActiveViewContext.write.*` 树，而应该收缩为：

1. 共享 `dispatch`
2. 一个很薄的 `patch(...)` 语义壳

#### C. 只包装一层 object literal 的公共 helper

如果某个 helper 只是：

1. 接收两个参数
2. 返回一个一眼就懂的 operation object
3. 没有隐藏任何策略

那就优先内联，不要维持一层公共 helper。

典型例子包括 planner 里的部分 operation 构造辅助。

### 7.2 应该保留的东西

#### A. 叶子级值 helper

可以保留：

- `@shared/core` 里的纯工具
- `active/index/shared.ts` 里真正的值变换 helper
- `runtime/history.ts` 的纯状态变换函数

#### B. core 层领域状态变换 API

应该保留并强化：

- `filter.add`
- `filter.setMode`
- `filter.clear`
- `sort.add`
- `sort.set`
- `sort.keepOnly`
- `sort.clear`
- `group.set`
- `group.toggle`
- `group.setMode`
- `search.set`

但要统一成：

1. 命名空间化导出
2. 短命名
3. no-op 返回原引用
4. 不再保留历史自由函数名

#### C. 低层 document 读取实现

`@dataview/core/document` 应该继续存在，但它的角色应该变成：

1. `DocumentReader` 的底层实现依赖
2. 少量核心模块的底层读实现

而不是继续让业务流程模块直接到处调用。

#### D. 共享与阶段入口

应该保留并强化：

- 共享 `dispatch`
- `runSnapshotStage`
- selector stack
- `CommitImpact`
- `ActiveViewContext`

## 8. 迁移后的依赖规则

为了防止 helper 再次扩散，长期最优方案必须配套依赖规则。

### 8.1 Planner 依赖规则

planner lowerer 只能直接依赖：

1. `PlannerScope`
2. `DocumentReader`
3. core 层领域状态变换 API
4. 纯候选值校验
5. 类型定义

planner lowerer 不应再直接依赖：

1. `createIssue`
2. `sourceOf`
3. `planResult`
4. `validateXxxExists`
5. `validateTarget` 这类带阶段编排语义的 helper

### 8.2 Active command 依赖规则

active command 模块只能直接依赖：

1. `ActiveViewContext`
2. `DocumentReader`
3. 共享 `dispatch`
4. core 层领域状态变换 API
5. 类型定义

active command 模块不应再直接依赖：

1. `active/commands/shared.ts`
2. `getDocumentFieldById`
3. 其他自己再拼一层读取 / 提交的 helper
4. 本地 `write.*` 包装树

### 8.3 Runtime / snapshot / api 依赖规则

凡是需要读取 document entity 的地方，优先依赖：

1. `DocumentReader`
2. selector stack

而不是继续在流程代码里直接导入 `getDocumentFieldById` / `getDocumentViewById`。

凡是需要触发写入的地方，优先依赖：

1. 共享 `dispatch`
2. 仅在本阶段必须时才保留一层极薄语义 helper

而不是在各阶段重新长出自己的 `write.*` 子系统。

### 8.4 架构约束建议

建议最终补一层 lint / import 约束：

1. `mutate/planner/*.ts` 不允许导入 `mutate/validate/entity.ts`
2. `mutate/planner/*.ts` 不允许导入 `mutate/planner/shared.ts`
3. `active/commands/*.ts` 不允许导入 `active/commands/shared.ts`
4. 高层流程模块不允许直接导入 `@dataview/core/document`，只能通过 `DocumentReader`
5. 高层流程模块不允许引入新的本地 `write.*` 总线

这样才能防止中轴建立后又被 helper 重新绕开。

## 9. 分阶段落地方案

### 第一阶段：先建立共享读中轴

1. 新建 `DocumentReader`
2. 提供 static / live 两种工厂
3. 把 planner、active、snapshot、api 里最常见的直接 document 读取先切过去

这是整个重构的底座。

### 第二阶段：明确共享写入口

1. 明确 `dispatch` 是唯一写入口
2. 不再让 `ActiveViewContext`、API facade、其他高层模块自行派生本地 `write.*`
3. 如果需要类型名，仅保留一个极薄 `EngineWriter = dispatch`

### 第三阶段：统一 core 层领域状态变换 API

1. 把 `addFilterRule`、`clearSorters`、`setGroupMode` 这类自由函数统一收敛成命名空间 API
2. 最终命名统一为 `filter.add`、`sort.clear`、`group.setMode` 这类短命名
3. 统一 no-op 语义为“返回原引用”
4. 删除旧名字，不留兼容导出
5. 迁移所有 engine / react / api 调用点到新命名

这一步不属于“可选清理”，而属于本次重构必须一起完成的范围。

### 第四阶段：重写 planner 为 `PlannerScope`

1. 新建 `PlannerScope`
2. 让 `planActions` / lowerer 只接收 `PlannerScope + action`
3. 把 `sourceOf`、`planResult`、`validateXxxExists`、target existence 逻辑全部吸收进去
4. 删除 `planner/shared.ts`
5. 删除 `validate/entity.ts`
6. 清掉 lowerer 对这些 helper 的直接导入

这一阶段完成后，planner 的业务代码会明显变短，并且表达力更高。

### 第五阶段：把 active command helper 收缩为最薄语义壳

1. `ActiveViewContext` 只保留 `reader + dispatch + view/state + patch`
2. 删除 `withViewPatch` 等 helper
3. 删除 `active/commands/shared.ts`
4. 所有 command 文件只面向 `ActiveViewContext`

### 第六阶段：统一 runtime / snapshot / api 的读入口

1. `active/demand.ts`
2. `active/read.ts`
3. `active/index/*`
4. `active/snapshot/*`
5. `api/*`

凡是需要读 document entity 的地方，都改为走 `DocumentReader` 或 selector stack。

### 第七阶段：补依赖边界

1. 删除遗留 helper
2. 补 import 规则
3. 统一命名与目录
4. 清理不再需要的中间层

## 10. 最终目录与概念收敛建议

长期最优不是增加更多层，而是减少中间层并收敛概念。

建议最终概念收敛为：

1. `DocumentReader`
   - 全 engine 共享读中轴
2. 共享 `dispatch`
   - 全 engine 共享写入口
3. `filter` / `sort` / `group` / `search`
   - core 层领域状态变换 API 命名空间
4. `PlannerScope`
   - planner 最薄语义壳
5. `ActiveViewContext`
   - active 最薄语义壳
6. selector stack
   - 响应式读中轴
7. `runSnapshotStage`
   - snapshot 阶段入口
8. `CommitImpact`
   - commit 写后影响入口

不建议再额外引入：

1. `EngineScope`
2. `ApiScope`
3. `MutationScope`
4. 二次包装的 helper bus
5. 每个阶段各自复制的 `reader.* / write.*` 树
6. core 层继续保留自由函数风格的旧领域变换命名

## 11. 最终判断

如果从长期最优、代码复用、全局架构一致性三个维度一起看，答案很明确：

1. `PlannerScope` 是 planner 该有的语义壳，但它不是全 engine 中轴。
2. 全 engine 真正共享的基础轴应该是两个：`DocumentReader` 和单一 `dispatch`。
3. core 层 `filter` / `sort` / `group` / `search` 这类 API 应该作为正式领域状态变换 API 一起收敛完成，而不是继续以 helper 名字散落存在。
4. engine 其他阶段不应该复用 planner 的 issue / require / finish 语义。
5. `ActiveViewContext` 也不应该再复制一棵自己的 `write.*` 树，active 的共享写能力应该直接回到 `dispatch`。
6. 也不应该用一个全局 `EngineScope` 去统一所有阶段，因为那会把 engine 重新做成一个高耦合垃圾抽屉。
7. 最优形态是：
   - 共享读轴统一到底层访问
   - 共享写轴统一到唯一入口
   - core 层领域状态变换 API 统一到命名空间短名
   - 阶段语义壳只保留本阶段不可替代的语义
   - 已经健康的阶段入口继续保留
   - 编排 helper 全部删除或回收到阶段语义壳

一句话总结：

> Dataview engine 的长期最优中轴，不是一个大而全的 scope，也不是每个阶段自己复制 reader/write 子树，而是共享 `DocumentReader`、共享单一 `dispatch`、统一的领域状态变换 API 命名空间，再加上各阶段最薄的语义壳。
