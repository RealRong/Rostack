# Dataview Core 进一步简化审计

## 1. 结论

`dataview-core` 这一轮已经把大方向收对了：

- public 面已经基本收口到 `document / field / view / operations / types`
- `operations` 已经替代旧 `mutation / operation / commit`
- `view` 已经替代旧 `filter / sort / search / group / calculation`

但距离“**spec + plain object 化**、**围绕一个核心构建底层**、**正式面最少**”还有三类剩余问题：

1. `field` 仍然有两个核心：
   - `src/field/index.ts`
   - `src/field/spec.ts`

   现在真正的跨 kind 规则内核其实在 `src/field/spec.ts`，但外部正式入口又是 `src/field/index.ts`。这会导致：

   - core 内部直连 `field/spec.ts`
   - engine 也直连 `field/spec.ts`
   - `field/index.ts` 反而更像 facade，而不是唯一核心

2. `view` 仍然存在若干中转/命名噪音文件：
   - `src/view/calc.ts`
   - `src/view/calcIndex.ts`
   - `src/view/shared.ts`
   - `src/view/options.ts`
   - `src/view/normalize.ts`

   这些文件里有一部分不是领域核心，而是为了拼 public 结构或承载小型 helper 而存在。

3. `operations` 已经是正式入口，但仍然保留了较强的“子模块直连心智”：
   - `src/operations/apply.ts`
   - `src/operations/compile.ts`
   - `src/operations/spec.ts`
   - `src/operations/trace.ts`
   - `src/operations/key.ts`
   - `src/operations/issue.ts`
   - `src/operations/definitions.ts`

   这在 core 内部问题不大，但从长期最优看，外层应该只有一个正式 `operations` 面；其余都应退为内部实现或测试入口，而不是默认使用路径。

---

## 2. 当前最值得继续收口的点

### 2.1 `field`：应收口成唯一核心

当前现状：

- `src/field/index.ts` 是 public 入口
- `src/field/spec.ts` 承担跨 kind 规则聚合
- `src/field/kind/spec.ts` 承担各 kind 具体 spec registry
- `src/field/options/index.ts` 又包了一层 `src/field/option.ts`
- `src/field/schema/index.ts` 也是一个薄层聚合

从长期最优看，正式结构应该是：

- `field` 是**唯一正式 field kernel**
- `field/kind/spec.ts` 是内部 registry
- 不应该再有一个对外长期存在的 `field/spec.ts`

### 最终目标

- 外部只用 `@dataview/core/field`
- engine / runtime / react / meta 不再直连：
  - `@dataview/core/field/spec`
  - `@dataview/core/field/kind`
  - `@dataview/core/field/options`
  - `@dataview/core/field/schema`

### 重构清单

1. 删除 `src/field/spec.ts`
   - 把其中真正需要长期暴露的跨 kind 行为并回 `src/field/index.ts`
   - 让 `field.index/search/group/display/draft/behavior/view/calculation` 都直接挂在 `field` 上

2. 删除 `src/field/options/index.ts`
   - 把其内容直接并入 `src/field/option.ts`
   - `field.option` 的正式实现直接来自 `option.ts`

3. 删除 `src/field/schema/index.ts`
   - schema 相关 helper 直接并入 `src/field/index.ts`
   - 或保留为内部文件，但不再作为独立层名暴露/依赖

4. 减少 engine 对 `field` 内部文件的直连
   - `active/index/demand.ts`
   - `active/index/bucket.ts`
   - `active/index/sort.ts`
   - `active/publish/viewModes.ts`
   应统一改为吃 `field` 正式面

### 额外判断

`src/field/kind/spec.ts` 虽然很大，但它是**领域内核本体**，不是中转层。它可以保留为一个大文件，没必要为了行数再拆碎。

---

### 2.2 `view`：应删掉小型中转层

当前最明显的噪音：

- `src/view/calc.ts` 只是把 `calcIndex.ts` 再转一层
- `src/view/shared.ts` 同时承载：
  - `isJsonObject`
  - `cloneViewOptions`
  - `resolveDisplayInsertBeforeFieldId`
- `src/view/options.ts`、`src/view/normalize.ts`、`src/view/state.ts` 三者边界不够干净
- engine 还在直连 `src/view/order.ts`

### 最终目标

- `view` 是唯一正式 view kernel
- 领域子域保留，但去掉纯中转文件
- core 外部不再直连 `view/order.ts` 这种内部实现文件

### 重构清单

1. 删除 `src/view/calc.ts`
   - 直接保留一个正式文件，例如：`src/view/calculation.ts`
   - 当前 `calc.ts + calcIndex.ts` 二选一即可，不需要两层

2. 删除 `src/view/shared.ts`
   - `isJsonObject` 直接局部内联到 `card.ts / gallery.ts / kanban.ts / calcCapability.ts`
   - `cloneViewOptions` 并入 `src/view/options.ts`
   - `resolveDisplayInsertBeforeFieldId` 并入 `src/view/state.ts` 或 `src/view/options.ts`

3. 收紧 `view options` 相关边界
   - `src/view/options.ts`：只负责 default / clone / prune / normalize
   - `src/view/state.ts`：只负责 display / order / calc / layout patch 等状态写法
   - `src/view/normalize.ts` 可并回 `src/view/options.ts`

4. 停止外层直连 `src/view/order.ts`
   - `document`
   - `operations/internal/read.ts`
   - `engine/document/reader.ts`
   - `engine/active/query/candidateSet.ts`
   应统一改成通过 `view.order.*` 访问

5. `view/index.ts` 继续保留为正式聚合面
   - 但它不应该再依赖为了“聚合而聚合”的小桥接文件

### 额外判断

下面这些大文件虽然大，但仍然是领域核心，不建议为了“拆文件”再分裂：

- `src/view/filterSpec.ts`
- `src/view/calcReducer.ts`
- `src/view/groupState.ts`

真正应该删的是中转层，而不是把核心算法继续切散。

---

### 2.3 `operations`：正式面应继续单核化

这一轮之后，`operations` 已经是正式 write kernel。但从长期最优看，还可以再往前走一步：

- `operations/index.ts` 应是唯一正式入口
- `operations/internal/*` 是内部实现
- `operations/apply.ts / compile.ts / key.ts / issue.ts / trace.ts / definitions.ts / spec.ts` 不应再被外层当成“常规 public 子入口”使用

### 最终目标

外层只保留：

- `@dataview/core/operations`

不鼓励也不默认使用：

- `@dataview/core/operations/spec`
- `@dataview/core/operations/definitions`
- `@dataview/core/operations/trace`
- `@dataview/core/operations/key`
- `@dataview/core/operations/issue`

### 重构清单

1. 外部消费全部回收到 `@dataview/core/operations`
   - engine / collab / tests 都优先从根入口拿

2. 如果测试需要观察内部能力
   - 单独设一个 `operations/testing.ts`
   - 不要把多个叶子文件都当成半公开 API

3. `apply.ts` 最终可删除
   - `reduceDataviewOperations` 直接从 `operations/index.ts` 暴露即可

4. `compile.ts` 是否保留，取决于是否要保留“编译器”这个一级概念
   - 如果保留，它应只是 `operations` 的内部实现文件
   - 而不是默认导入路径

5. `spec.ts / definitions.ts / trace.ts / key.ts / issue.ts`
   - 作为 core 内部组织是合理的
   - 但应弱化为“内部结构文件”，而不是长期 public 子面

### 额外判断

`src/operations/definitions.ts` 很大，但它是 write-domain 的核心 spec 表，和 `field/kind/spec.ts` 一样，**大并不是问题**。问题在于它现在仍然容易被当成一层 public 子模块来直接依赖。

---

## 3. 不建议继续动的点

### 3.1 `document`

`src/document/*` 当前已经比较干净：

- `create.ts`
- `normalize.ts`
- `fields.ts`
- `records.ts`
- `values.ts`
- `views.ts`

这里没有明显的中转层问题。除非未来要把 `document.create / normalize / clone` 进一步做成更强的一致结构，否则不建议继续重构。

### 3.2 `types`

`src/types/*` 目前主要是纯类型承载：

- `state.ts`
- `intents.ts`
- `operations.ts`
- `commit.ts`
- `presentation.ts`

这层已经足够直接。没必要为了“更少文件”把它们揉成一个大类型文件。

---

## 4. 最终理想结构

长期最优应该收敛到：

- `types`：纯数据模型
- `document`：doc create / normalize / read-write helpers
- `field`：唯一 field kernel
- `view`：唯一 view kernel
- `operations`：唯一 write kernel

也就是外部正式面只剩：

- `@dataview/core`
- `@dataview/core/types`
- `@dataview/core/document`
- `@dataview/core/field`
- `@dataview/core/view`
- `@dataview/core/operations`

内部实现允许存在子文件，但这些子文件不再被外层直接依赖。

---

## 5. 实施顺序

### Phase 1：先收 `field`

原因：

- 现在 `field/spec.ts` 是最大的剩余双核心问题
- engine 仍然大量直连 `field/spec.ts`
- 这会阻碍后续 `view` 和 `engine` 的进一步单核化

执行：

1. 把 `field/spec.ts` 的正式能力并回 `field/index.ts`
2. 清掉 `field/options/index.ts`
3. 清掉 `field/schema/index.ts`
4. 改掉 engine/core 中的 `field/spec` / `field/kind` 直连

### Phase 2：再收 `view`

执行：

1. 删 `view/calc.ts`
2. 合并 `calcIndex.ts` 到正式单文件
3. 删 `view/shared.ts`
4. 合并 `view/normalize.ts` 到 `view/options.ts`
5. 清掉 engine/core 对 `view/order.ts` 的直连

### Phase 3：最后收 `operations` 外部用法

执行：

1. 把测试和外围包的 `operations/*` 子路径依赖收回 `operations`
2. 如仍需测试入口，新增单一 `operations/testing.ts`
3. 视情况删除 `apply.ts` 等纯转发叶子文件

---

## 6. 一句话判断

当前 `dataview-core` 已经摆脱了旧分层，但还没有完全做到“**field / view / operations 三个单核**”。

接下来最有价值的不是再拆大文件，而是：

- 删 `field` 的双核心
- 删 `view` 的小型中转层
- 让 `operations` 真正只剩一个正式入口

这三步做完，`dataview-core` 才算真正进入长期最优形态。
