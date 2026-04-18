# Dataview Store Read Path 性能审计

## 范围

- 只审计 `dataview` 相关代码路径。
- 覆盖三层：
  - `dataview-engine`
  - `dataview-runtime`
  - `dataview-react`
- 底层 store 内核来自 `shared/core`，因为 dataview 的读路径直接建立在这套内核之上，所以内核里和 dataview 直接相关的成本模型也纳入审计。
- 不包含 `whiteboard`。

## 审计结论

当前 dataview 的 store 读路径还有 3 类主要性能问题，另有 1 项底层热点已在当前分支修复：

1. keyed store 很多只是“表面 keyed”，底层依赖实际上仍然是 whole-store/global-state。
2. [已修复] `createKeyedDerivedStore` 的 family cache 命中路径历史上带有 `O(cache size)` 清扫成本，当前分支已改成 O(1) 命中 + 异步 idle 回收。
3. 高频 UI 状态混入 keyed render store，导致 hover、selection、visibility 这类热状态把大批 key 一起打脏。
4. 即使最终 `isEqual` 挡住了 React commit，很多重算本身仍然包含全量扫描、数组/Map 线性比较、字段投影重建等成本。

这意味着现在 dataview 的主要问题不是“没有按 key 缓存”，而是：

- invalidation 太宽
- 高频热状态仍然会把大量 keyed node 一起打脏
- per-key 重算函数里仍然夹带中等到重度计算

## 影响面概览

我在 dataview 内部扫到的相关规模：

- `createKeyedDerivedStore` 在 dataview 代码中出现了 31 处。
- `dataview-runtime` 里直接以 `readActiveTypedViewState(read(input.activeStateStore), ...)` 形式读取 whole active state 的位置有 12 处。
- `dataview-engine` / `dataview-runtime` 中直接读取 whole `input.store` / `input.activeStateStore` 的 selector/model 入口至少有 19 处。

这些数字本身不是问题，问题在于其中相当一部分 keyed store 都不是依赖 keyed source，而是依赖 whole active/runtime/document state。

## 发现 1

### 严重级别

高

### 结论

dataview 里大量 keyed selector / keyed model 实际依赖的是 whole runtime state 或 whole active view state。结果是：

- 任意 runtime state 变化，都可能让所有 keyed 节点先进入 dirty。
- 任意 active view state 变化，都可能让 gallery / kanban / table 的 keyed item/section/header/footer 节点先进入 dirty。
- 即使最终 `isEqual` 发现值没变，重算和依赖图刷新成本已经发生了。

### 证据

#### 1.1 `createRuntimeKeyedSelector` 先读 whole runtime store

文件：`dataview/packages/dataview-engine/src/runtime/selectors/core.ts`

关键代码：

- 第 20-29 行：`createRuntimeKeyedSelector`
- 第 26 行：`get: key => input.read(read(input.store), key)`

这里 keyed selector 的底层依赖键是 `read(input.store)`，也就是 `NO_KEY` 级别的 whole runtime store，而不是某个真正的 keyed source。

#### 1.2 `DocumentSelectApi` 的 `records/fields/views.byId` 建立在 whole runtime store 上

文件：`dataview/packages/dataview-engine/src/api/documentSelect.ts`

关键代码：

- 第 16-40 行：`createDocumentSelectApi`
- 第 23-40 行：`records/fields/views` 都通过 `createDocumentEntitySelectors(...)`

而 `createDocumentEntitySelectors` 的 `byId` 最终走到：

- `dataview/packages/dataview-engine/src/runtime/selectors/document.ts`
- `dataview/packages/dataview-engine/src/runtime/selectors/core.ts`

因此 `select.records.byId`、`select.fields.byId`、`select.views.byId` 虽然表面是 keyed API，但 invalidation 仍然先挂在 whole runtime store 上。

#### 1.3 dataview-runtime 的 view model keyed store 普遍先读 whole active state

文件：

- `dataview/packages/dataview-runtime/src/model/gallery/api.ts`
- `dataview/packages/dataview-runtime/src/model/kanban/api.ts`
- `dataview/packages/dataview-runtime/src/model/table/api.ts`

典型位置：

- gallery
  - 第 133-147 行：`section`
  - 第 149-182 行：`card`
  - 第 184-209 行：`content`
- kanban
  - 第 134-151 行：`sectionBase`
  - 第 153-189 行：`card`
  - 第 191-216 行：`content`
- table
  - 第 94-116 行：`header`
  - 第 118-130 行：`footer`
  - 第 132-147 行：`section`

这些 store 的共同模式都是：

```ts
get: key => {
  const active = readActiveTypedViewState(read(input.activeStateStore), '...')
  ...
}
```

也就是说 keyed 节点的第一层依赖不是 `itemId/sectionKey/fieldId` 对应的 keyed source，而是 whole active state。

### 影响

- 单个 item 改动、单个 section 可见性变化、单个 query 变化，都可能先把大量 keyed 节点打脏。
- 50k 规模下，哪怕每个节点重算都很轻，dirty fan-out 也会很可观。
- 这类问题在 React 侧表现为：
  - `useKeyedStoreValue(...)` 虽然是 keyed 订阅
  - 但订阅到的 keyed node 本身已经被 whole-store invalidation 污染

### 优先级建议

P0

### 最优改造方向

- 不要再用 `createKeyedDerivedStore(get: key => read(globalStore)...)` 作为主模型构建方式。
- 把 active/doc/runtime 切成真正可 keyed 订阅的源：
  - `active.sections.byKey`
  - `active.items.byId`
  - `active.headerByFieldId`
  - `document.records.byId`
  - `document.fields.byId`
- 如果暂时不能拆源，至少引入更细粒度的 version store：
  - `active.rev.items`
  - `active.rev.sections`
  - `active.rev.query`
  - `document.rev.records`
  - `document.rev.fields`

## 发现 2

### 严重级别

高，已在当前分支修复

### 结论

`createKeyedDerivedStore` 之前的缓存命中路径不是 O(1)，每次 `get/subscribe` 都会先扫一遍整个 family cache。当前分支已经重写为：

- `resolveStore()` 命中缓存只做 `Map.get(cacheKey)` + 更新 entry 元数据。
- idle entry 不再在读路径上 sweep，而是在 `onIdle` 时加入待清理集合，并通过 microtask 异步增量回收。
- 如果 key 在 cleanup 执行前被再次访问，会把 `idle` 复位，避免误删刚刚重新激活的 entry。

### 证据

文件：`shared/core/src/store/family.ts`

关键代码：

- 第 30-32 行：`pendingIdleCacheKeys` + `idleCleanupScheduled`
- 第 34-57 行：`flushIdleEntries()` / `scheduleIdleCleanup()`
- 第 62-67 行：命中缓存路径只做 `Map.get(cacheKey)`、`cached.idle = false`、返回 `cached.node`
- 第 80-83 行：`onIdle` 只标记 idle 并调度异步 cleanup

当前实现意味着：

- `store.get(key)`
- `store.subscribe(key, listener)`
- `internal keyed subscribe`

在命中缓存前不再做 `cache.forEach(...)` 全表扫描。

### 影响

修复前，当一个 keyed family 挂了很多 key 时：

- 每次读取任意 key，都先付出 `O(cache size)` 成本。
- 在列表/网格/看板等场景里，React render 会频繁调用 `store.get(key)`。
- mounted key 越多，这个前置成本越重。

这会把“按 key 缓存”的收益吃掉一大块，尤其是：

- table 行级 store
- gallery / kanban 卡片级 store
- section/header/footer keyed store

当前分支修复后，这条 shared/core 热点已经从 dataview 的主要读路径瓶颈里移除。

### 优先级建议

已完成（原 P0）

### 已落地实现

- 删除读路径上的 `familyRevision += 1` / `sweep()`。
- idle eviction 改成 `onIdle -> pendingIdleCacheKeys -> queueMicrotask(flushIdleEntries)`。
- cleanup 只遍历待清理 key，不再扫整个 family cache。
- 新增测试覆盖：
  - idle cleanup 为异步调度
  - cleanup 前再次读取同 key 不会误删 entry

## 发现 3

### 严重级别

高

### 结论

高频 UI 状态被建模成 whole-store，然后再在 keyed render store 中按 key 读取。结果是：

- hover 移动一次，所有相关 keyed node 先 dirty
- grid selection/focus/fill 变化一次，所有相关 row keyed node 先 dirty
- kanban 某个 section 的可见性变化一次，所有 section keyed node 先 dirty

### 证据

#### 3.1 table hover 的 row/cell keyed store 读 whole hover state

文件：`dataview/packages/dataview-react/src/views/table/hover.ts`

关键代码：

- 第 75-87 行：`cell`
- 第 88-92 行：`row`
- 第 78 行：`hoveredCellOf(read(state).target)`
- 第 90 行：`hoveredRowIdOf(read(state).target)`

这里 `cell(rowId)` / `row(rowId)` 都依赖 whole `state.target`。

#### 3.2 table row render keyed store 读 whole selection/hover/fill chrome

文件：`dataview/packages/dataview-react/src/views/table/rowRender.ts`

关键代码：

- 第 68-83 行：`selectionChrome`
- 第 85-99 行：`fillCell`
- 第 101-146 行：最终 keyed `RowRender`
- 第 109 行：`const selectionState = read(selectionChrome)`
- 第 118-120 行：`const hoverTarget = ... read(options.hoverTargetStore)`
- 第 121 行：`const fillHandleCell = read(fillCell)`

这意味着每次：

- grid selection 改变
- hover target 改变
- fill handle 改变

所有 `rowRender(rowId)` 节点都会先 dirty。

#### 3.3 kanban section 在 keyed store 内读 whole visibility map

文件：`dataview/packages/dataview-react/src/views/kanban/runtime.ts`

关键代码：

- 第 420-440 行：`section`
- 第 428 行：`const currentVisibility = read(visibilityStore).get(key)`

这里 `section(key)` 依赖的是 whole `visibilityStore`，不是 keyed visibility source。

### 影响

- table：鼠标 hover、键盘移动 focus、拖拽 fill handle 都是高频操作。
- kanban：show more / create / section item count 变化可能扩散到所有 section keyed 节点。
- 这些都是“交互频率高 + fan-out 大”的组合。

### 优先级建议

P0

### 最优改造方向

- hover / selection chrome / visibility 都要拆成真正 keyed 的源：
  - `hover.cellByRef`
  - `hover.rowById`
  - `rowRenderById`
  - `kanban.visibilityBySection`
- 不要在 keyed store 里做 `read(global).get(key)`。
- table 的 `rowRender` 最好拆成多路 keyed source，再在 React 侧只订阅该行真正需要的几个子状态。

## 发现 4

### 严重级别

中高

### 结论

不少 per-key 重算函数本身并不轻。即使 invalidation 收窄了，这些 `get(key)` 仍然带中等成本。

### 证据

#### 4.1 gallery / kanban content 每次都重建属性数组

文件：

- `dataview/packages/dataview-runtime/src/model/gallery/api.ts`
- `dataview/packages/dataview-runtime/src/model/kanban/api.ts`

关键代码：

- gallery
  - 第 196-205 行：`active.fields.custom.map(...)` + `properties.some(...)`
- kanban
  - 第 203-212 行：`active.fields.custom.map(...)` + `properties.some(...)`

也就是每个 card content 重算都要：

- 遍历全部自定义字段
- 生成新的 `properties` 数组
- 再做一次 `some(...)`

如果前面的 invalidation 又是 whole active state，这个成本会被按卡片数量放大。

#### 4.2 table header 每个 field 都线性扫描 sort rules

文件：`dataview/packages/dataview-runtime/src/model/table/api.ts`

关键代码：

- 第 109-111 行：`active.query.sort.rules.find(...)`

也就是每个 header keyed 节点在重算时，都线性扫描一次 sort rules。

#### 4.3 page toolbar/queryBar/settings 会反复重算可用字段列表

文件：`dataview/packages/dataview-runtime/src/model/page/api.ts`

关键代码：

- 第 165-194 行：`toolbar`
- 第 196-222 行：`queryBar`
- 第 224-240 行：`settings`

这里每次重算都会做：

- `read(documentFields)`
- `read(documentViews)`
- `filterRules.map(...)`
- `sortRules.map(...)`
- `getAvailableFilterFields(...)`
- `getAvailableSorterFields(...)`

这些都不是常数成本。

### 影响

- 页面工具栏 / query bar / 设置弹层在 query 变更时会重复做派生。
- gallery / kanban 在大字段数和大卡片量场景下，content projection 成本会比较明显。

### 优先级建议

P1

### 最优改造方向

- table header：
  - 先把 `sort.rules` 预投影成 `Map<FieldId, Direction>`
  - keyed header 直接 O(1) 取
- gallery / kanban content：
  - 把 `visible custom fields` 和 `record content projection` 分层缓存
  - 当字段列表没变时，不要每个 card 都重新 `map + some`
- page model：
  - 对 `availableFilterFields` / `availableSortFields` 建 query-signature 级缓存

## 发现 5

### 严重级别

中

### 结论

即使 React 最终没有 rerender，selector 计算成本仍然会发生。

### 证据

#### 5.1 `useStoreSelector` 每次 store emission 都会执行 selector

文件：`dataview/packages/dataview-react/src/dataview/storeSelector.ts`

关键代码：

- 第 12-25 行：`useStoreSelector`
- 第 22 行：`() => selectorRef.current(store.get())`

也就是说只要上游 `store.subscribe` 触发，selector 一定会跑一遍。

#### 5.2 `useExternalValue` 只是缓存结果引用，不会避免 `getSnapshot()` 本身执行

文件：`shared/react/src/useExternalValue.ts`

关键代码：

- 第 9-18 行：`getCachedSnapshot`
- 第 10 行：先执行 `const next = getSnapshot()`
- 第 13-18 行：只是用 `equal` 决定是否复用旧引用

### 影响

- 对 whole session/page/toolbar/settings 这类全局 store 使用 selector 时：
  - rerender 可能被挡住
  - 但 selector 计算成本仍然存在
- 所以 “我用了 selector + isEqual” 不等于 read path 已经便宜。

### 优先级建议

P1

### 最优改造方向

- 优先缩窄上游 store，而不是指望 React selector 挡住成本。
- 如果 selector 很热，应该把 selector 逻辑前移为 store graph 内的稳定派生节点，而不是每个 consumer 各算一遍。

## 发现 6

### 严重级别

中

### 结论

selection domain 里仍然有线性扫描路径，在高频选择交互时会累积成本。

### 证据

文件：`dataview/packages/dataview-runtime/src/selection/domain.ts`

关键代码：

- 第 27-72 行：`createItemArraySelectionDomain`
- 第 41-69 行：`indexOf / prev / next / range` 全部依赖 `ids.indexOf(...)`

### 影响

- 这不是 dataview 当前最主要的热点，因为主路径更多走 `ItemList` domain。
- 但只要有 array domain 落入高频选择交互，这就是显式的线性路径。

### 优先级建议

P2

### 最优改造方向

- `createItemArraySelectionDomain` 改成一次性构建 `indexById`。
- `indexOf / prev / next / range` 走 O(1) 索引访问。

## 发现 7

### 严重级别

中

### 结论

大量 `sameOrder / sameMap / sameIdOrder` 在线性扫描对象，当前它们是在 invalidation 之后做“止损”，不是零成本。

### 证据

文件：`shared/core/src/equality.ts`

关键代码：

- 第 26-42 行：`sameOrder`
- 第 58-76 行：`sameMap`

dataview 中的典型使用：

- `dataview-runtime/src/model/gallery/api.ts`
- `dataview-runtime/src/model/kanban/api.ts`
- `dataview-runtime/src/model/table/api.ts`
- `dataview-runtime/src/model/page/api.ts`

### 影响

- 如果 invalidation 已经过宽，最后一步再做线性 equality 只是在“减少错误提交”，不会减少前面的重算成本。
- 大数组、大 Map、多字段属性列表下，这一步本身也会成为明显成本。

### 优先级建议

P2

### 最优改造方向

- 先修 invalidation 粒度。
- 再考虑引入结构化版本号或稳定引用，减少 `sameOrder/sameMap` 的触发频率。

## 优先级排序

### P0

1. keyed selector / keyed model 去 whole-store 依赖化。
2. table / kanban 的高频 UI 状态拆成真正 keyed source。

### P1

1. 压缩 per-key 重算函数中的扫描与投影重建。
2. page model 的可用字段推导做签名缓存。
3. 尽量让热 selector 变成 store graph 内的稳定派生节点，不要在 React hook 侧重复算。

### P2

1. `createItemArraySelectionDomain` 索引化。
2. `sameOrder / sameMap` 进一步版本化或引用稳定化。

## 最值得先做的三件事

### 1. 重构 dataview-runtime model 的 keyed read source

把下面这类模式整体替换掉：

```ts
createKeyedDerivedStore({
  get: key => {
    const active = readActiveTypedViewState(read(input.activeStateStore), '...')
    ...
  }
})
```

优先拆出：

- `active.itemById`
- `active.sectionByKey`
- `active.headerByFieldId`
- `active.summaryByScopeId`

### 2. 已完成：重写 `shared/core/src/store/family.ts`

当前结果：

- `resolveStore()` 纯 O(1) 命中
- eviction 已脱离读路径
- 空闲回收改成 microtask 异步增量清理
- cleanup 前再次访问同 key 不会误删已恢复活跃的 entry

### 3. 拆掉 table / kanban 的全局 hover/visibility/render 混合源

优先对象：

- `dataview/packages/dataview-react/src/views/table/hover.ts`
- `dataview/packages/dataview-react/src/views/table/rowRender.ts`
- `dataview/packages/dataview-react/src/views/kanban/runtime.ts`

## 最终判断

dataview 当前 store read path 的核心问题不是“有没有缓存”，而是：

- 缓存节点依赖错层
- invalidation 不按真正的数据边界传播
- 重算函数内还有非必要扫描

如果只继续做 React 组件级 memo、selector 或更细订阅，收益会有限。真正的杠杆在于：

1. 把 global source 切成 keyed source
2. 把 hover / selection / visibility 这类热状态从 whole-store 依赖里拿出来
3. 继续压缩 per-key 重算函数里的扫描、投影重建和线性比较
