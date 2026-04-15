# Dataview Selection Runtime 中轴化重构方案

## 结论

长期最优的方案不是继续修补现有的 `ids[]` 选择链路，而是把 selection 从“全量物化后的 id 数组”升级为“基于有序 domain 的选择表达式 + 查询接口 + keyed 订阅层”。

这次重构的核心判断只有一个：

- `selection` 不应该再把 `readonly ItemId[]` 当成 source of truth
- `selection` 应该只持久化选择语义
- 只有在真正需要枚举结果时，才物化为 `ids[]`

最终目标是：

1. `cmd+a`、表头全选、scope 全选、marquee、拖拽、批量删除都走同一套 selection controller
2. 选择状态在 table / gallery / kanban 之间复用，不再各自手写一套数组逻辑
3. UI 不再订阅整份 selection 并自行 `new Set()` / `reduce()` / `filter()`
4. “全选”从 O(N) 或 O(N^2) 降为 O(1)
5. “全选后取消少量项”变成按变更量增长，而不是按总数据量增长

这不是一次局部性能优化，而是一次 runtime 数据模型升级。

---

## 为什么现在会卡

当前 selection 的根模型定义在 `dataview/packages/dataview-react/src/runtime/selection/types.ts`：

```ts
export interface Selection {
  ids: readonly ItemId[]
  anchor?: ItemId
  focus?: ItemId
}
```

这个模型会把全链路锁死在“先算出整份 `ids[]`，再往下传”的思路上，直接导致以下问题。

### 1. 全选天然退化为全量数组路径

无论是 table 内的 `cmd+a`，还是表头 scope 全选，本质都要构造一个“包含所有选中项的数组”。

这会让下面这些动作都被迫依赖整表规模：

- `selectAll`
- scope `add`
- scope `toggle`
- marquee add / toggle
- 回滚到 base selection
- group header 的 all / some / none 判断

### 2. normalize 逻辑把“全选”放大成平方级

当前 `normalizeOrderedValues()` 的实现是：

```ts
return order.filter(candidate => values.some(value => equal(candidate, value)))
```

这会让 `normalize(order, order)` 退化为 O(N^2)。

这类调用在以下路径上都会出现：

- `cmd+a`
- scope checkbox 首次全选
- marquee 预览提交
- 任意 `set(ids)` / `toggle(ids)` / `add(ids)` 的归一化阶段

### 3. UI 组件被迫自行做选择汇总

当前各视图组件普遍订阅 raw selection store，然后自己计算：

- `readSelectionIdSet(selection).has(itemId)`
- `new Set(selection.ids)`
- `rowIds.reduce(...)`
- `currentSelection.ids.filter(...)`

这导致：

- 业务组件承担了本应属于 runtime 的聚合逻辑
- 同一份选择语义在不同组件里重复实现
- scope 的 all / some / none 被分散到 UI 层

### 4. marquee 把“数组化 selection”继续扩散

当前 marquee session 直接保存：

```ts
baseSelectedIds: readonly ItemId[]
```

这意味着 marquee 自己也在扮演一个“selection 合成器”，而不是一个“框选输入设备 + hit-test 提供者”。

结果就是：

- marquee 和 selection 的边界混乱
- preview / commit / cancel 都会再次落回 `ids[]` 路径
- base selection 会被整份复制和重放

### 5. 订阅模型是粗粒度广播

当前 value store 更新一次 selection，会通知所有订阅者；行、卡片、scope header 都基于这份大对象自行提取局部信息。

这意味着：

- membership 判断不是 keyed 的
- scope summary 不是 keyed 的
- 一个局部变化无法按 key 做最小化通知

---

## 设计原则

### 1. 选择的 source of truth 必须是“语义”，不是“结果数组”

selection runtime 只保存：

- 当前选择表达式
- anchor / focus
- 绑定到哪个 ordered domain

selection runtime 不默认保存：

- 整份选中 `ids[]`

### 2. 必须支持 include / exclude 双表示

如果系统只支持“显式列出被选中的 ids”，那么：

- 全选永远需要 O(N) 物化
- 全选后取消少量项依然需要维护一个超大数组

因此必须支持：

- `include`: 显式包含这些 id
- `exclude`: 选中 domain 中除这些 id 外的全部项

### 3. domain 必须是一等公民

selection 不是无序集合操作。

它天然依赖：

- 当前 view 的 item order
- 当前 section 的子序
- `anchor -> focus` 的 range
- `prev / next / at / indexOf`

因此 selection 必须显式依赖 ordered domain，而不是到处传裸 `ids[]`。

### 4. scope 必须是一等公民

表头全选、分组全选、视图全选都不是“把一批 id 塞进 API”的临时动作，而是 selection 的基础语义。

因此 runtime 必须直接支持：

- `command.scope.replace(scope)`
- `command.scope.add(scope)`
- `command.scope.remove(scope)`
- `command.scope.toggle(scope)`
- `query.summary(scope)`

### 5. UI 只能消费查询接口，不能再自己汇总

组件层只允许消费：

- `query.contains(id)`
- `query.summary(scope)`
- `query.count(scope?)`
- keyed 订阅结果

组件层不允许继续承担：

- `Set` 构造
- scope 聚合
- selection normalize
- base / hit 合并

### 6. 物化必须推迟到边界

只有在以下边界才允许把 selection 物化为 `ids[]`：

- 删除选中项
- 批量移动 / reorder
- 向外部 mutation API 提交
- 序列化调试输出

除此之外，runtime 与 UI 都只消费 selection 语义和查询接口。

---

## 目标能力

重构后的 selection runtime 需要天然支持以下场景：

1. `cmd+a` 选择整个当前视图
2. table 表头全选当前 scope
3. group header 计算 `none / some / all`
4. 单项 toggle
5. shift range extend
6. marquee replace / add / toggle
7. 全选后取消少量项
8. domain 变化后自动 rebase
9. row / card / scope header 的 keyed 订阅
10. table / gallery / kanban 共用一套 runtime

---

## 非目标

这次重构不尝试解决以下问题：

1. cell selection 与 row selection 的统一模型
2. 跨 view 的全局多域选择
3. 撤销栈对 selection 的持久化建模
4. selection 与 hover / active edit / inline session 的统一 store

这些问题可以在后续迭代里继续收敛，但不应阻塞当前重构。

---

## 新的核心模型

## 一、Ordered Domain

selection 必须绑定到一个 ordered domain。

```ts
export interface OrderedSelectionDomain<TId> {
  revision: number
  count: number
  has(id: TId): boolean
  indexOf(id: TId): number | undefined
  at(index: number): TId | undefined
  prev(id: TId): TId | undefined
  next(id: TId): TId | undefined
  range(anchor: TId, focus: TId): readonly TId[]
  iterate(): Iterable<TId>
}
```

设计要求：

- `revision` 在 domain 顺序或成员变化时递增
- `range()` 必须是 domain 原生能力，不再通过数组外推
- table / gallery / kanban 共用这个接口

现有 `ItemList` 已经具备大部分能力：

- `count`
- `has`
- `indexOf`
- `at`
- `prev`
- `next`
- `range`

因此可以以 `ItemList` 为基础做一层 adapter，而不是重新发明列表结构。

## 二、Selection Shape

selection snapshot 不再默认保存 `ids[]`，而是保存 shape。

```ts
export type SelectionShape<TId> =
  | { kind: 'empty' }
  | { kind: 'include'; ids: ReadonlySet<TId> }
  | { kind: 'exclude'; ids: ReadonlySet<TId> }
```

语义如下：

- `empty`: 没有任何选中项
- `include`: 仅选中 `ids`
- `exclude`: 选中 domain 中除 `ids` 之外的所有项

例子：

- clear: `empty`
- 单选一项: `include + {a}`
- 多选三项: `include + {a,b,c}`
- 全选: `exclude + {}`
- 全选后取消两项: `exclude + {x,y}`

## 三、Selection Snapshot

```ts
export interface SelectionSnapshot<TId> {
  shape: SelectionShape<TId>
  anchor?: TId
  focus?: TId
  selectedCount: number
  domainRevision: number
}
```

说明：

- `selectedCount` 必须缓存，避免 UI 反复统计
- `domainRevision` 用于识别 domain 失效与 rebase
- `anchor` / `focus` 仍保留，继续支撑 shift extend

---

## Scope 模型

scope 不再只是一个 `rowIds[]` 临时参数，而是 domain 上的命名子集引用。

```ts
export interface SelectionScope<TId> {
  key: string
  count: number
  has(id: TId): boolean
  iterate(): Iterable<TId>
}
```

在 table 中：

- 整个 view 是一个 scope
- 每个 section 是一个 scope

在 gallery / kanban 中：

- 当前 view 是一个 scope
- 未来如需按列、按 group 统计，也直接走同一套 scope 模型

注意：

- scope 不再向组件传递 `rowIds: readonly ItemId[]`
- scope summary 由 runtime 直接计算

---

## 新的 Selection Controller

selection 对外应该暴露为“意图 + 查询”，而不是“传进来一批 ids，我给你算一个数组”。

```ts
export type SelectionSummary = 'none' | 'some' | 'all'

export interface SelectionController<TId> {
  state: {
    getSnapshot(): SelectionSnapshot<TId>
    subscribe(listener: () => void): () => void
  }

  command: {
    clear(): void
    selectAll(): void

    ids: {
      replace(ids: Iterable<TId>, options?: {
        anchor?: TId
        focus?: TId
      }): void
      add(ids: Iterable<TId>): void
      remove(ids: Iterable<TId>): void
      toggle(ids: Iterable<TId>): void
    }

    scope: {
      replace(scope: SelectionScope<TId>, options?: {
        anchor?: TId
        focus?: TId
      }): void
      add(scope: SelectionScope<TId>): void
      remove(scope: SelectionScope<TId>): void
      toggle(scope: SelectionScope<TId>): void
    }

    range: {
      extendTo(id: TId): void
    }
  }

  query: {
    contains(id: TId): boolean
    count(scope?: SelectionScope<TId>): number
    summary(scope?: SelectionScope<TId>): SelectionSummary
  }

  enumerate: {
    iterate(scope?: SelectionScope<TId>): Iterable<TId>
    materialize(scope?: SelectionScope<TId>): readonly TId[]
  }

  store: {
    membership(id: TId): ReadStore<boolean>
    scopeSummary(scopeKey: string): ReadStore<SelectionSummary>
  }
}
```

其中：

- `state` 只负责 snapshot 与整体订阅
- `command` 只负责写操作，并按 `ids / scope / range` 分组
- `query` 只负责轻量只读查询，不混入昂贵物化
- `enumerate` 明确承载边界输出能力，提醒调用方这是高成本路径
- `store` 只负责 UI keyed 订阅，不让组件直接消费 raw selection object
- `command.selectAll()` 是 O(1)
- `query.summary(scope)` 是 scope 级聚合能力
- `enumerate.materialize()` 是边界能力，不是内部主路径

这样命名空间化之后，调用形状也更稳定：

- `selection.command.ids.toggle(ids)`
- `selection.command.scope.toggle(scope)`
- `selection.command.range.extendTo(id)`
- `selection.query.summary(scope)`
- `selection.enumerate.materialize(scope)`
- `selection.store.membership(id)`

---

## 关键算法

## 一、`query.contains`

```ts
query.contains(id):
  if shape.kind === 'empty': return false
  if shape.kind === 'include': return includeSet.has(id)
  if shape.kind === 'exclude': return domain.has(id) && !excludeSet.has(id)
```

复杂度：

- O(1)

## 二、`command.selectAll`

```ts
command.selectAll():
  shape = { kind: 'exclude', ids: emptySet }
  selectedCount = domain.count
```

复杂度：

- O(1)

## 三、toggle 单项

规则：

- `include` 下切换，就是增删 `includeSet`
- `exclude` 下切换，就是增删 `excludeSet`

复杂度：

- O(1)

对应 API：

- `selection.command.ids.toggle([id])`

## 四、`query.summary`

```ts
query.summary(scope):
  selected = query.count(scope)
  if selected === 0: return 'none'
  if selected === scope.count: return 'all'
  return 'some'
```

关键在于 `query.count(scope)` 的实现不能回到“扫完整个 domain”的旧路上。

推荐实现：

- `include` 模式：遍历较小的 `includeSet`，统计有多少落在 scope 中
- `exclude` 模式：`scope.count - excludedInScope`

这意味着复杂度取决于“异常集大小”，而不是总数据量。

## 五、range extend

range 继续走 domain 的原生 `range(anchor, focus)`：

```ts
command.range.extendTo(id):
  const anchor = current.anchor ?? current.focus ?? id
  const ids = domain.range(anchor, id)
  shape = optimizeInclude(ids)
  focus = id
```

优化点：

- 如果 `ids.length > domain.count / 2`，可以直接转成 `exclude`
- 即 range 结果也允许自动选择最优表示

## 六、`enumerate.materialize`

```ts
enumerate.materialize():
  if empty: return []
  if include: return order-preserved ids from includeSet
  if exclude: return domain items except excluded ids
```

注意：

- `enumerate.materialize()` 必须显式标记为昂贵边界操作
- UI 组件不能依赖它做日常渲染

---

## 运行时订阅层

selection runtime 必须提供两套订阅能力，而不是只有一份 raw store。

## 一、`state`

提供整份 snapshot 的订阅，供少量需要整体上下文的逻辑使用：

- debug
- 边界同步
- domain rebase

推荐形态：

```ts
selection.state.getSnapshot()
selection.state.subscribe(listener)
```

## 二、`store.membership`

```ts
selection.store.membership(id): ReadStore<boolean>
```

用于：

- table row
- gallery card
- kanban card

要求：

- 只有 membership 实际变化的 key 才通知
- 组件不再自己从 raw selection 提取 `has(id)`

## 三、`store.scopeSummary`

```ts
selection.store.scopeSummary(scopeKey): ReadStore<SelectionSummary>
```

用于：

- table 顶部全选按钮
- section header checkbox
- 未来任何 group scope header

要求：

- scope header 不再自己统计 `selectedRowCount`
- `RowScopeSelectionRail` 只渲染，不负责选择聚合

---

## 与现有视图的边界

## 一、Table

table 是本次重构的第一落点，也是收益最大的视图。

### 需要删除的旧模型

- `RowScopeSelectionRailProps.rowIds`
- header block 中直接携带整份 `rowIds`
- 组件内自己统计 `selectedRowCount`
- 组件内自己执行 `selection.normalize([...ids])`

### 新模型

每个 header block 只携带 scope 引用：

```ts
export interface TableRowScopeRef extends SelectionScope<ItemId> {
  kind: 'view' | 'section'
}
```

`RowScopeSelectionRail` 改为：

```ts
export interface RowScopeSelectionRailProps {
  scope: TableRowScopeRef
  label?: string
}
```

渲染逻辑收敛为：

- `summary = selection.query.summary(scope)` 或直接订阅 `selection.store.scopeSummary(scope.key)`
- `checked = summary === 'all'`
- `indeterminate = summary === 'some'`
- 点击时调用 `selection.command.scope.toggle(scope)`

这样 table header 的性能特性变成：

- flat view 全选：`selection.command.selectAll()` 为 O(1)
- section 全选：`selection.command.scope.toggle(scope)` 为 O(1) 或 O(k)，其中 `k` 为异常数
- header 复渲染：只依赖 scope summary keyed store

## 二、Gallery / Kanban

gallery / kanban 侧的行级需求很简单，重点只是 membership。

重构后：

- 卡片组件改为订阅 `selection.store.membership(itemId)`
- 不再 `useDataViewValue(selection.store, selection => has(id))`

这样能让：

- 卡片视图不再依赖 raw selection object
- selection 组件用法在各视图之间完全统一

## 三、共享 interaction runtime

当前 `useItemSelectionRuntime()` 暴露的是：

- `getSelectedIds()`
- `isSelected(id)`
- `select(id, mode)`

长期方案里应改为对新 controller 的薄封装：

- `selection.command.ids.replace([id])`
- `selection.command.ids.toggle([id])`
- `selection.command.range.extendTo(id)`
- `selection.query.contains(id)`
- `selection.enumerate.iterate()`

这样 shared interaction runtime 不再关心 selection 的底层表示。

---

## Marquee 重构

marquee 必须退回成“框选输入设备 + hit-test 协调器”，而不是 selection 合成器。

## 一、现状问题

当前 marquee session 直接保存：

```ts
baseSelectedIds: readonly ItemId[]
```

这会让 marquee：

- 复制 base selection
- 自己做 add / toggle / replace 语义合成
- preview / cancel / commit 都围绕 `ids[]` 展开

## 二、新模型

marquee session 改成：

```ts
export interface MarqueeSessionState<TId> {
  ownerViewId: ViewId
  mode: 'replace' | 'add' | 'toggle'
  start: Point
  current: Point
  box: Box
  baseSelection: SelectionSnapshot<TId>
}
```

marquee adapter 只提供：

- `order()` 或 domain 句柄
- `getHitIds(session)`
- `previewSelection(snapshot)` 可选

selection 合成逻辑全部回到 selection controller：

- `command.ids.replace(hitIds)`
- `command.ids.add(hitIds)`
- `command.ids.toggle(hitIds)`

### 好处

1. marquee 不再维护 selection 算法
2. preview / commit / cancel 使用同一份 controller 语义
3. base selection 可以直接保留 shape，不再整份数组化

---

## Domain Rebase

当 domain 发生变化时，selection 需要自动 rebase。

场景包括：

- query 结果变化
- group 改变
- 排序改变
- 删除记录
- 跨 section 移动

## 一、rebase 规则

### `empty`

- 保持 `empty`

### `include`

- 删除 domain 中不存在的项
- 更新 `selectedCount`
- 清理失效的 `anchor` / `focus`

### `exclude`

- 删除 domain 中不存在的“排除项”
- `selectedCount = domain.count - excluded.size`
- 如果 `excluded.size` 大于 `domain.count / 2`，可自动压缩成 `include`

## 二、anchor / focus 规则

如果 `anchor` 或 `focus` 已不在 domain 中：

- 优先保留仍合法的另一端
- 否则回退为 `undefined`

## 三、何时触发

domain adapter 暴露 `revision`，当 revision 改变时自动 rebase。

这比当前 `syncSelection(ids)` 的思路更稳，因为：

- 不再依赖 `ids[]` 对齐
- 不再每次通过 normalize 重建整份数组

---

## 物化边界

尽管内部不再以 `ids[]` 为中轴，但系统仍有少数边界必须消费数组。

这些边界应该被显式收敛到 `enumerate.materialize()`：

1. `engine.active.items.remove(...)`
2. 批量 reorder / move
3. 少量 legacy API 仍要求 `readonly ItemId[]`
4. 调试输出

要求：

- 所有 `selection.get().ids` 读取都应被替换为 `selection.enumerate.materialize()` 或 `selection.enumerate.iterate()`
- 不允许业务组件日常 render 读取 `selection.enumerate.materialize()`

---

## 性能特性

## 一、目标复杂度

重构后的关键路径应满足：

- `selectAll`: O(1)
- `contains(id)`: O(1)
- 单项 toggle: O(1)
- scope summary: O(min(scope.size, exception.size))
- marquee add / toggle: O(hitIds)
- domain rebase: O(exception.size)
- materialize all: O(domain.count)

这里的 `exception.size` 指：

- `include` 下的 selected set size
- `exclude` 下的 excluded set size

真正的性能收益来自：

- 常见大选择场景不再与总数据量线性绑定
- UI 订阅变成 keyed 局部通知

## 二、目标体验

目标不是只让 10k 行“能跑”，而是让以下动作不再随数据量线性恶化：

1. table `cmd+a`
2. table 顶部全选 checkbox
3. group header checkbox
4. 全选后取消少量行
5. marquee 大范围选择

---

## 代码组织建议

推荐把 selection 中轴下沉为独立模块，而不是继续散落在 `dataview-react` 视图代码里。

## 一、建议目录

```txt
dataview/packages/dataview-react/src/runtime/selection/
  controller.ts
  domain.ts
  scope.ts
  snapshot.ts
  membershipStore.ts
  scopeSummaryStore.ts
  materialize.ts
  rebase.ts
  types.ts
```

如果后续要让 engine 层也直接复用该模型，也可以再下沉到更底层包。

## 二、模块职责

- `types.ts`
  - 只放抽象类型
- `domain.ts`
  - `ItemList -> OrderedSelectionDomain` adapter
- `controller.ts`
  - selection 核心状态机与操作
- `rebase.ts`
  - domain revision 变化后的重算规则
- `membershipStore.ts`
  - keyed membership 通知
- `scopeSummaryStore.ts`
  - keyed scope summary 通知
- `materialize.ts`
  - 显式数组物化边界

---

## Table 侧具体改造点

## 一、`selection/types.ts`

删除：

- `Selection.ids`

替换为：

- `SelectionSnapshot.shape`
- `selectedCount`
- `domainRevision`

## 二、`selection/api.ts`

旧接口：

- `all()`
- `set(ids)`
- `toggle(ids)`
- `extend(to)`

新接口：

- `command.selectAll()`
- `command.ids.replace(ids)`
- `command.ids.toggle(ids)`
- `command.scope.replace(scope)`
- `command.scope.toggle(scope)`
- `query.summary(scope)`
- `query.contains(id)`

## 三、`RowScopeSelectionRail.tsx`

旧逻辑删除：

- `selectedRowIdSet`
- `rowIds.reduce(...)`
- `[...currentSelection.ids, ...props.rowIds]`
- `currentSelection.ids.filter(...)`

新逻辑只保留：

- 订阅 `store.scopeSummary(scope.key)`
- 调用 `command.scope.toggle(scope)`

## 四、`layoutModel.ts`

旧 block：

```ts
{
  kind: 'column-header',
  rowIds: currentView.items.ids
}
```

新 block：

```ts
{
  kind: 'column-header',
  scopeKey: 'view' | section.key
}
```

scope 数据不再放进 block payload。

## 五、`Row.tsx`

旧逻辑：

- 订阅 raw selection store
- 本地 `has(itemId)`

新逻辑：

- 订阅 `selection.store.membership(itemId)`

---

## Marquee 侧具体改造点

## 一、`runtime/marquee/types.ts`

`baseSelectedIds` 改为 `baseSelection`。

## 二、`Page/hosts/MarqueeHost.tsx`

旧逻辑：

- `resolveMarqueeSelection()`
- `selectionHelpers.set(...)`
- `selectionHelpers.toggle(...)`

新逻辑：

- 从 adapter 获取 `hitIds`
- 根据 mode 调用 `controller.command.ids.*`
- preview / commit / cancel 都只恢复 controller snapshot

## 三、previewSelection

如果需要 preview：

- preview 也应是 `SelectionSnapshot`
- 或更简单，直接由 controller 支持临时 preview layer

长期上，preview 也不应该继续传整份 `ids[]`

---

## 迁移策略

虽然用户不在乎重构成本，但为了降低一次性切换风险，仍建议按阶段推进。

## 阶段 1：引入新中轴，不动 UI

目标：

- 实现新 controller / domain / scope / rebase
- 保留旧 API 的兼容包装

做法：

- `set(ids)` 内部转调 `command.ids.replace(ids)`
- `all()` 内部转调 `command.selectAll()`
- `get()` 暂时可返回兼容对象，但不再作为内部中轴

## 阶段 2：先切 table

优先改：

- `RowScopeSelectionRail`
- `selectionRuntime`
- `input.ts`
- `layoutModel.ts`
- `MarqueeHost`
- `Row.tsx`

原因：

- table 是性能问题最显著的地方
- table 同时覆盖 scope、membership、marquee 三条关键路径

## 阶段 3：切 gallery / kanban

改造重点：

- 卡片 selected 订阅切到 `store.membership`
- interaction runtime 切到新 controller

## 阶段 4：删除旧数组中心 API

删除：

- `Selection.ids`
- `selection.normalize(order, ids)` 作为主路径
- 任何组件级 `new Set(selection.ids)` / `reduce(rowIds)`

## 阶段 5：收敛 boundary materialization

审计所有 `selection.get().ids`、`selection.ids` 使用点，统一改为：

- `enumerate.iterate()`
- `enumerate.materialize()`

---

## 测试策略

这次重构必须补充系统性测试，而不是只测一两个 helper。

## 一、Controller 单测

覆盖：

1. clear
2. selectAll
3. include / exclude 切换
4. toggle 单项
5. add / remove 多项
6. scope add / remove / toggle
7. extend range
8. rebase on domain shrink
9. rebase on domain reorder
10. materialize 顺序正确

## 二、Scope summary 单测

覆盖：

1. empty scope
2. partial include
3. full include
4. full selectAll
5. selectAll 后排除少量项
6. section scope 与 view scope 同时存在

## 三、Membership keyed store 测试

覆盖：

1. 只通知发生变化的 key
2. 全选时大量 key 的通知策略正确
3. exclude 模式下单项切换通知正确

## 四、集成测试

覆盖：

1. table `cmd+a`
2. table 表头全选
3. group header checkbox
4. marquee replace / add / toggle
5. gallery card multi-select
6. kanban card multi-select

## 五、性能回归测试

至少加入基准或断言型性能 smoke test：

1. `selectAll` 在大 domain 上不物化 `ids[]`
2. table scope summary 不扫完整表
3. 全选后取消少量项不会退化成全量拷贝

---

## 风险与控制

## 一、风险：兼容层过长

如果长期保留“新 controller + 旧 ids API 双轨”，最终系统仍会被旧路径拖回数组化模型。

控制方式：

- 兼容层只作为迁移过渡
- 在 table / gallery / kanban 切完后立即删除旧中轴

## 二、风险：scope summary 实现不当

如果 scope summary 内部偷偷 materialize 整个 scope，性能问题只是换了个地方。

控制方式：

- summary 只能基于 `scope.has(id)` 与异常集计算
- 不允许内部走 `scope.iterate()` 全量枚举，除非 scope 本身很小且明确接受

## 三、风险：membership keyed store 通知过多

全选动作在语义上会改变大量 membership key，因此理论上仍会触发大量可见项更新。

这不是问题的核心，真正要避免的是：

- 在通知之前就先跑全量数组构造
- 在每个组件里重复做 scope 统计

控制方式：

- 接受可见项的必要重渲染
- 删除全链路的全量数组中间态

## 四、风险：materialize 被滥用

如果业务层习惯性调用 `enumerate.materialize()`，新模型的收益会被迅速吃掉。

控制方式：

- 给 `enumerate.materialize()` 增加明确命名与注释，标注为昂贵边界
- 审计 UI render 代码中是否读取 `enumerate.materialize()`

---

## 最终形态

这次重构完成后，selection runtime 应满足下面这组稳定边界：

1. source of truth 是 `SelectionSnapshot`
2. snapshot 的核心是 `SelectionShape`
3. shape 支持 `empty / include / exclude`
4. selection 永远绑定到 `OrderedSelectionDomain`
5. scope 是一等公民
6. UI 只消费 `store.membership` 与 `store.scopeSummary`
7. marquee 只负责 hit-test 与交互，不再自己合成 selection
8. `ids[]` 只在 mutation 边界物化

到这一步之后：

- `cmd+a` 不再是“构造 N 个 id 的大数组”
- 表头全选不再和整表大小强绑定
- `RowScopeSelectionRail` 不再承担选择汇总
- gallery / kanban / table 真正复用一套 selection 中轴

---

## 一步到位的推荐实施顺序

如果不考虑重构成本，推荐的一步到位顺序是：

1. 先实现新的 `SelectionController`、`OrderedSelectionDomain`、`SelectionScope`
2. 同步重写 `MarqueeHost`，把 `baseSelectedIds` 改成 `baseSelection`
3. 重写 table `RowScopeSelectionRail` 与 header scope block
4. 把 row / card 订阅切到 `store.membership`
5. 删除旧 `Selection.ids` 与所有 `normalize(order, ids)` 主路径
6. 最后只保留 `enumerate.materialize()` 作为边界能力

这是最重的一种改法，但也是结构最干净、后续复杂度最低的一种改法。
