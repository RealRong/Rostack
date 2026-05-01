# Dataview / Whiteboard Mutation Helper 上提清单

## 1. 目标

- 盘点 `dataview` 与 `whiteboard` 当前 mutation compile / planner 层仍然依赖的 helper。
- 明确哪些 helper 实际上已经成为“领域写入中轴”的一部分，应该上提到各自 domain mutation ports 扩展层。
- 明确哪些 helper 虽然不属于 mutation ports，但应作为 patch mode / diff utility 上提到 shared core。
- 明确哪些 helper 只是 compile orchestration 或纯领域业务逻辑，不应上提到中轴。
- 明确哪些 helper 只是对 `program.xxx` 的零语义转发，应直接删除而不是继续抽象。

本文讨论两条不同的上提路线：

- mutation ports uplift：把领域编码规则收回 domain mutation ports 中轴。
- patch mode uplift：把通用 `current -> next -> minimal patch` 能力收回 shared core。

同时还涉及两条基础收口路线：

- reader uplift：把 target 解析、实体查找等纯读逻辑收回 reader 中轴。
- compile control uplift：把 issue / invalid / cancelled / fail / require 这类控制流 API 收回 shared compile context。

## 2. 中轴边界

这里说的“中轴”分三层：

- shared mutation kernel 中轴：`@shared/mutation` 提供通用 `MutationPorts` / `MutationProgramWriter` / runtime primitive，只承载通用 mutation 原语，不承载 dataview / whiteboard 的领域编码规则。
- domain mutation ports 中轴：`dataview` / `whiteboard` 各自围绕 shared ports 再包一层领域端口，把领域对象 id、anchor、path、ref 编码等固定转换收进去，compile / planner 不再自己散写这些转换。
- shared core patch mode：`@shared/core` 提供通用 `json.diff(base, next)` 这类 JSON-like diff utility，只负责生成最小 patch，不负责 mutation step 编码。
- shared compile control 中轴：`@shared/mutation` 的 compile context 统一承载 issue / invalid / cancelled / fail / require 这类控制流 API，domain 不再保留第二套同义 helper。
- domain reader 中轴：`dataview` / `whiteboard` 的 reader 统一承载 target 解析、实体查找、聚合读取等纯读逻辑，不在 compile/base 中重复定义。

结论约束：

- 只要 helper 包含领域 path 编码、领域 target 编码、领域 anchor 编码，它就更接近 domain mutation ports 中轴。
- 只要 helper 只是对象 diff、校验、查找、报错、planner orchestration，它就不属于 mutation ports 中轴。
- 只要 helper 负责 `current -> next -> minimal patch`，它优先归到 shared core patch mode，而不是 shared mutation ports。
- 只要 helper 只是对 compile context 的 `issue/fail/require` 做语义同义包装，它就应上提到 shared compile control 中轴，而不是留在 domain。
- 只要 helper 负责 target 解析、实体查找、集合归一化这类纯读行为，它就应上提到 reader 中轴，而不是留在 compile/base。
- 只要 helper 只是 `program.xxx` 的零语义转发，它不该上提，应该直接删掉。

## 3. 强建议上提

### 3.1 Dataview `writeRecordValuesMany`

位置：

- [dataview/packages/dataview-core/src/mutation/compile/base.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/base.ts:150)

当前依赖点：

- [dataview/packages/dataview-core/src/mutation/compile/record.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/record.ts:229)
- [dataview/packages/dataview-core/src/mutation/compile/field.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/field.ts:258)
- [dataview/packages/dataview-core/src/mutation/compile/field.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/field.ts:421)
- [dataview/packages/dataview-core/src/mutation/compile/field.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/field.ts:485)

判断：

- 这是 dataview 的领域写入原语，不是通用 helper。
- 它负责把 `FieldId -> record patch path` 编码成 `title` / `values.<fieldId>`，然后再落到 `program.record.patchMany(...)`。
- 这种“字段语义到底层 patch 写法”的固定转换，不应该散在 compile/base。

结论：

- 应上提到 dataview 自己的 mutation ports 扩展层。
- 不应上提到 shared `MutationPorts`，因为 shared 不应该知道 dataview 的 `title` / `values.<fieldId>` 语义。

### 3.2 Whiteboard `canvasOrder` 的 ref 编码

位置：

- [whiteboard/packages/whiteboard-core/src/mutation/compile/write.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/write.ts:146)
- [whiteboard/packages/whiteboard-core/src/mutation/planner/canvas.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/planner/canvas.ts:9)

当前依赖点：

- `writeCanvasOrderMove`
- `writeCanvasOrderSplice`
- `writeCanvasOrderDelete`
- planner 内直接调用 `canvasRefKey(ref)`

判断：

- `canvasRefKey(ref)` 已经同时出现在 compile helper 和 planner 中，说明“canvas item ref 与 ordered item id 的映射”是 whiteboard mutation 端口的稳定职责。
- compile / planner 不应自己知道 ordered target 内部 item key 编码。

结论：

- 应上提到 whiteboard 自己的 mutation ports 扩展层。
- compile / planner 最终只应表达 `ref`，不应显式做 `canvasRefKey(...)`。

### 3.3 Whiteboard `edgeLabels` / `edgeRoute` 的 anchor 适配

位置：

- [whiteboard/packages/whiteboard-core/src/mutation/compile/write.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/write.ts:34)
- [whiteboard/packages/whiteboard-core/src/mutation/compile/write.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/write.ts:169)
- [whiteboard/packages/whiteboard-core/src/mutation/compile/write.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/write.ts:204)

判断：

- `EdgeLabelAnchor` / `EdgeRoutePointAnchor` 到 shared `MutationOrderedAnchor` 的适配是 whiteboard ordered target 的领域编码规则。
- 这类 anchor 形态转换不属于 compile 业务逻辑，而属于 ports adapter。

结论：

- 应上提到 whiteboard 自己的 mutation ports 扩展层。
- compile 层最终不应自己维护 `toOrderedAnchor(...)` 这种 target-specific 转换。

## 4. 可选上提

### 4.1 Dataview `viewDisplay` / `viewOrder` 的 insert-before 语法糖

位置：

- [dataview/packages/dataview-core/src/mutation/compile/viewDiff.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/viewDiff.ts:401)

涉及 helper：

- `writeViewDisplayInsert`
- `writeViewOrderInsert`

判断：

- 这两个 helper 本质只是把 `before?: string` 转成 ordered anchor，再调用 `writer.viewDisplay(viewId).insert(...)` / `writer.viewOrder(viewId).insert(...)`。
- 它们比 `writeRecordValuesMany` 更薄，更多是端口使用体验问题，而不是缺失的核心中轴。

结论：

- 可以并入 dataview mutation ports 扩展层，作为顺手 API。
- 优先级低于 `writeRecordValuesMany`。

### 4.2 Dataview `writeViewUpdate`

位置：

- [dataview/packages/dataview-core/src/mutation/compile/viewDiff.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/viewDiff.ts:357)

判断：

- 这是完整的 `current view -> next view -> mutation ops` lowering 集中点。
- 它内部包含 filter / sort / display / order 四套 diff 与写入流程：
  - [dataview/packages/dataview-core/src/mutation/compile/viewDiff.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/viewDiff.ts:168)
  - [dataview/packages/dataview-core/src/mutation/compile/viewDiff.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/viewDiff.ts:225)
  - [dataview/packages/dataview-core/src/mutation/compile/viewDiff.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/viewDiff.ts:273)
  - [dataview/packages/dataview-core/src/mutation/compile/viewDiff.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/viewDiff.ts:315)

结论：

- 如果后续目标是把“view projection lowering”整体收敛成 dataview mutation 中轴的一部分，它是合格候选。
- 如果只是做 helper 上提清理，它不必优先处理。
- 它不应上提到 shared 层，只能留在 dataview domain 内部。

## 5. Patch Mode Uplift

### 5.1 Dataview `createEntityPatch` -> `@shared/core/json.diff(base, next)`

位置：

- [dataview/packages/dataview-core/src/mutation/compile/patch.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/patch.ts:45)
- [shared/core/src/json.ts](/Users/realrong/Rostack/shared/core/src/json.ts:1)

判断：

- `createEntityPatch` 的职责不是 target 编码、anchor 编码或 ports 写入，而是从 `current` / `next` 生成最小 patch。
- 这类能力应视为 patch mode / diff utility，而不是 mutation ports 能力。
- 它当前的实现语义本质上就是 JSON-like recursive diff：
  - plain object 递归比较
  - array 默认整值替换
  - primitive 直接替换
  - 删除字段用 `undefined` 表达

实施方案：

- 将这类能力正式上提到 `@shared/core`。
- 具体落点定为 `shared/core/src/json.ts`，以 `json.diff(base, next)` 形式暴露。
- 不使用 `createEntityPatch` 这种带 domain 语义的命名。
- `json.diff(base, next)` 保持通用 JSON-like 语义，不内置 `id` 特判，不内置 schema comparator，不内置 domain 级 exclude 规则。
- dataview / whiteboard 后续如果需要忽略 `id` 或做实体级 patch 约束，应在 domain 自己包一层，而不是把这些特判塞进 shared `json.diff(...)`。

结论：

- 这是明确应实施的上提项。
- 但它属于 shared core patch mode uplift，不属于 mutation ports uplift。

## 6. Compile Control Uplift

### 6.1 Dataview / Whiteboard 的 issue / fail helper 统一收回 shared compile context

位置：

- [dataview/packages/dataview-core/src/mutation/compile/base.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/base.ts:18)
- [whiteboard/packages/whiteboard-core/src/mutation/compile/helpers.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/helpers.ts:92)
- [shared/mutation/src/engine/contracts.ts](/Users/realrong/Rostack/shared/mutation/src/engine/contracts.ts:80)

涉及 helper：

- dataview: `pushIssue`、`issue`、`reportIssues`
- whiteboard: `failInvalid`、`failCancelled`

判断：

- 这些 helper 并没有新增 domain 语义，它们只是把 shared compile context 已有的 `issue(...)` / `fail(...)` 再包一层。
- 这类控制流 API 如果继续散在各 domain，会形成第二套、第三套同义接口，compile 写法无法统一。
- 这里真正缺的不是 domain helper，而是 shared compile context 还没有把常用语义糖直接暴露完整。

实施方案：

- shared compile context 直接提供统一控制 API。
- 最终 compile 代码只允许使用下列 shared context 方法：
  - `ctx.issue(issue)`
  - `ctx.issue(...issues)`
  - `ctx.invalid(message, details?, path?)`
  - `ctx.cancelled(message, details?, path?)`
  - `ctx.fail(issue)`
  - `ctx.require(value, issue)` 或后续统一替换成更合适的 `ctx.expect(...)`
- 不引入 `issueMany(...)`，批量上报统一通过 `ctx.issue(...)` 接受单个或多个 issue 完成。
- dataview 本地 `issue` / `reportIssues` 删除。
- whiteboard 本地 `failInvalid` / `failCancelled` 删除。

结论：

- 这是明确应实施的 shared compile control uplift。
- 它和 ports uplift 是并行但不同的一条线。

### 6.2 Dataview `requireValue` -> shared `ctx.require(...)` / `ctx.expect(...)`

位置：

- [dataview/packages/dataview-core/src/mutation/compile/base.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/base.ts:74)
- [shared/mutation/src/engine/contracts.ts](/Users/realrong/Rostack/shared/mutation/src/engine/contracts.ts:96)

判断：

- `requireValue` 不负责读取领域数据，它负责“如果值不存在，则按统一控制流上报 issue 并返回 `undefined`”。
- 这类逻辑不是 reader，也不是 ports，而是 compile context control。
- shared compile context 现在已经有 `require(...)` primitive，因此 dataview 不应继续保留第二套同义 helper。

实施方案：

- dataview 本地 `requireValue` 删除。
- compile 统一改为 shared `ctx.require(...)`。
- 如果后续觉得 `require(...)` 命名不够明确，可以统一升级成 `ctx.expect(...)`，但这件事也应发生在 shared，而不是 domain。

结论：

- `requireValue` 应收敛到 shared compile control 中轴。

## 7. Reader Uplift

### 7.1 Dataview `resolveTarget` -> reader 中轴

位置：

- [dataview/packages/dataview-core/src/mutation/compile/base.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/base.ts:98)

判断：

- `resolveTarget` 的职责是把领域 `EditTarget` 解析成实际 `RecordId[]`。
- 这是纯读逻辑，不涉及 mutation write port，也不属于 compile control。
- 把它放在 compile/base 会导致读取协议和报错协议耦在一起，后续其他 compile 文件也会继续围绕 base.ts 长 helper。

实施方案：

- `resolveTarget` 从 compile/base 删除。
- 解析逻辑收回 reader 中轴，例如 `ctx.reader.records.resolveTarget(...)`。
- compile 负责决定解析失败后如何发 issue。
- reader 可以返回纯结果，也可以返回带 issue payload 的结果，但它不直接操纵 compile control。

结论：

- `resolveTarget` 应收敛到 reader 中轴。

## 8. Whiteboard Planner Collapse

### 8.1 `runCustomPlanner` / `WhiteboardCustomPlanContext` / `WhiteboardCustomOperation` 整套删除

位置：

- [whiteboard/packages/whiteboard-core/src/mutation/compile/helpers.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/helpers.ts:150)
- [whiteboard/packages/whiteboard-core/src/mutation/planner/types.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/planner/types.ts:1)

判断：

- `runCustomPlanner(...)` 只是把 `ctx` 拆成 `document / reader / services / program / fail` 再转手调用 planner。
- 它没有引入独立领域模型，也没有形成真正的抽象边界。
- `WhiteboardCustomPlanContext` / `WhiteboardCustomOperation` 只是为了支撑这层跳转而存在。
- 结果是 compile 站点明明已经知道自己要发什么 program op，却还要额外构造一层 `op` 对象再跳去 planner，看代码时必须再多跳一层文件。

实施方案：

- 删除 `runCustomPlanner(...)`。
- 删除 `WhiteboardCustomPlanContext`。
- 删除 `WhiteboardCustomOperation`。
- 删除 planner 对 compile context 的二次包装。
- planner 目录不再承担“compile -> custom op -> planner”桥接角色。

最终原则：

- 单点调用、纯 lowering 的 planner，直接并回调用它的 compile handler。
- 多点复用但仍然只是 compile 内部算法的 planner，降级成 compile 层内部 helper，不再保留 planner entry / custom context。

### 8.2 最终迁移列表

#### 8.2.1 直接并回 compile 的项

- `planCanvasOrderMove`
  位置：[whiteboard/packages/whiteboard-core/src/mutation/planner/canvas.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/planner/canvas.ts:9)
  当前调用点：[whiteboard/packages/whiteboard-core/src/mutation/compile/canvas.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/canvas.ts:324)
  判断：单点调用，纯 `canvas.order.move -> program.canvasOrder().move/splice(...)` lowering。
  最终去向：直接并回 `compile/canvas.ts`。

- `planMindmapCreate`
  位置：[whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts:50)
  当前调用点：[whiteboard/packages/whiteboard-core/src/mutation/compile/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/mindmap.ts:84)
  判断：单点调用，纯 create lowering。
  最终去向：直接并回 `compile/mindmap.ts` 的 `mindmap.create` 路径。

- `planMindmapLayout`
  位置：[whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts:152)
  当前调用点：[whiteboard/packages/whiteboard-core/src/mutation/compile/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/mindmap.ts:135)
  判断：单点调用，纯 patch lowering。
  最终去向：直接并回 `compile/mindmap.ts`。

- `planMindmapTopicMove`
  位置：[whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts:325)
  当前调用点：[whiteboard/packages/whiteboard-core/src/mutation/compile/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/mindmap.ts:173)
  判断：单点调用，逻辑短，直接围绕 `mindmapTree.move/patch` 发 program。
  最终去向：直接并回 `compile/mindmap.ts`。

#### 8.2.2 降级成 compile 内部 helper 的项

- `planMindmapMove`
  位置：[whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts:126)
  当前调用点：
  [compile/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/mindmap.ts:142)
  [compile/canvas.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/canvas.ts:280)
  [compile/node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/node.ts:82)
  [compile/node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/node.ts:308)
  判断：不是单点调用，但仍然只是 compile 内部的统一 move lowering。
  最终去向：降级成 compile 层内部私有 helper，不再保留 planner 入口。

- `planMindmapDelete`
  位置：[whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts:88)
  当前调用点：
  [compile/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/mindmap.ts:128)
  [compile/canvas.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/canvas.ts:84)
  判断：两处调用，但逻辑仍是 compile 内部删除 lowering。
  最终去向：降级成 compile 层内部 helper，不再保留 planner 入口。

- `planMindmapTopicDelete`
  位置：[whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts:365)
  当前调用点：
  [compile/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/mindmap.ts:180)
  [compile/canvas.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/canvas.ts:91)
  判断：两处调用，但仍是 compile 内部 topic-delete lowering。
  最终去向：降级成 compile 层内部 helper。

- `planMindmapTopicPatch`
  位置：[whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts:406)
  当前调用点：
  [compile/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/mindmap.ts:273)
  [compile/node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/node.ts:113)
  判断：两处调用，但本质是 mindmap topic patch lowering。
  最终去向：降级成 compile 层内部 helper。

- `planMindmapTopicInsert`
  位置：[whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts:178)
  当前调用点：
  [compile/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/mindmap.ts:162)
  [compile/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/mindmap.ts:217)
  判断：虽然有多次调用，但全部集中在同一 compile 文件，适合作为 `compile/mindmap.ts` 内部私有 helper。
  最终去向：降级成 `compile/mindmap.ts` 内部 helper。

- `planMindmapBranchPatch`
  位置：[whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts:463)
  当前调用点：
  [compile/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/mindmap.ts:242)
  [compile/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/mindmap.ts:291)
  判断：调用面集中在同一 compile 文件，属于 mindmap compile 内部子步骤。
  最终去向：降级成 `compile/mindmap.ts` 内部 helper。

- `planMindmapTopicCollapse`
  位置：[whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts:511)
  当前调用点：
  [compile/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/mindmap.ts:254)
  [compile/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/mindmap.ts:282)
  判断：调用面集中在同一 compile 文件，属于 mindmap compile 内部子步骤。
  最终去向：降级成 `compile/mindmap.ts` 内部 helper。

#### 8.2.3 直接删除的项

- `planMindmapRestore`
  位置：[whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts:70)
  判断：当前没有 compile 调用点。
  最终去向：直接删除；如果未来需要 restore compile handler，应直接在 compile 路径重建，不恢复 planner 桥接层。

- `planMindmapTopicRestore`
  位置：[whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/planner/mindmap.ts:301)
  判断：当前没有 compile 调用点。
  最终去向：直接删除；如果未来需要 restore compile handler，应直接在 compile 路径重建。

### 8.3 `planner/common.ts` 的最终去向

位置：

- [whiteboard/packages/whiteboard-core/src/mutation/planner/common.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/planner/common.ts:1)
- [whiteboard/packages/whiteboard-core/src/mutation/targets.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/targets.ts:42)

判断：

- `planner/common.ts` 不只是 planner 内部依赖，`targets.ts` 也在使用 `clone` / `same` / `uniqueSorted`。
- 这说明它其实不是 planner 专属模块，而是一组 mutation-level utility。

实施方案：

- 不随 planner 目录一起删除。
- 迁出 `planner/` 目录，改到更中性的 `mutation/common.ts` 或按职责拆回 `targets.ts` / `shared/core`。
- 至少要消除 `targets.ts -> planner/common.ts` 这种反向依赖。

结论：

- `planner/common.ts` 不保留在 planner 目录。
- 但它不是 `runCustomPlanner` 一套的一部分，不能连带误删。

## 9. 不建议上提到 Mutation Ports 中轴

### 9.1 Dataview / Whiteboard 的 orchestration helper

位置：

- [dataview/packages/dataview-core/src/mutation/compile/base.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/base.ts:18)
- [whiteboard/packages/whiteboard-core/src/mutation/compile/helpers.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/helpers.ts:58)

涉及 helper：

- whiteboard: `requireNode`、`requireEdge`、`requireGroup`、`requireMindmap`

判断：

- 这些是 compile context orchestration，不是 mutation write port。
- 它们管理的是报错、查找、控制流，而不是 program step 编码。

结论：

- 不应上提到 mutation ports 中轴。

## 10. 应直接删除而不是上提

### 10.1 Whiteboard `compile/write.ts` 中的纯 CRUD 转发 helper

位置：

- [whiteboard/packages/whiteboard-core/src/mutation/compile/write.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/write.ts:44)

涉及 helper：

- `writeDocumentCreate`
- `writeDocumentPatch`
- `writeNodeCreate`
- `writeNodePatch`
- `writeNodeDelete`
- `writeEdgeCreate`
- `writeEdgePatch`
- `writeEdgeDelete`
- `writeGroupCreate`
- `writeGroupPatch`
- `writeGroupDelete`
- `writeMindmapCreate`
- `writeMindmapPatch`
- `writeMindmapDelete`
- `writeMindmapTreeInsert`
- `writeMindmapTreeMove`
- `writeMindmapTreeDelete`
- `writeMindmapTreeRestore`
- `writeMindmapTreePatch`

判断：

- 这批 helper 大多只是 `program.xxx` 的一层直接转发，没有新的领域抽象，也没有稳定编码规则。
- 继续保留只会让 compile 看起来像在调高层 API，实际却只是多了一层跳转。

结论：

- 这批 helper 不该上提。
- 更合理的方向是直接删除并内联到调用方。

### 10.2 Whiteboard 中只为“换个名字”存在的 write helper

位置：

- [whiteboard/packages/whiteboard-core/src/mutation/compile/write.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/write.ts:169)
- [whiteboard/packages/whiteboard-core/src/mutation/compile/write.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/write.ts:204)

判断：

- 如果仅保留 `writeEdgeLabelPatch` / `writeEdgeRoutePatch` 这种方法名包装，而没有额外 anchor 或 ref 编码逻辑，也不值得保留。
- 真正应保留的是“领域编码入口”，不是每个 CRUD 动词都再起一个名字。

结论：

- 上提时应只保留有编码价值的 domain port 方法。
- 没有编码价值的 helper 应一并去掉。

## 11. 建议执行顺序

1. 先把 dataview `createEntityPatch` 收敛到 `@shared/core/json.diff(base, next)`，明确 shared core patch mode 基线。
2. 再把 dataview / whiteboard 的 issue / fail 同义 helper 收回 shared compile context，统一为 `ctx.issue(...)`、`ctx.invalid(...)`、`ctx.cancelled(...)`、`ctx.fail(...)`。
3. 再把 dataview `requireValue` 收敛到 shared `ctx.require(...)` / `ctx.expect(...)`，并把 `resolveTarget` 收回 reader 中轴。
4. 删除 `runCustomPlanner` / `WhiteboardCustomPlanContext` / `WhiteboardCustomOperation`，把 whiteboard planner 目录从“桥接层”降级或删除。
5. 先把单点纯 lowering 的 whiteboard planner 直接并回对应 compile handler，再把多点复用的 planner 降级成 compile 内部 helper。
6. 再处理 dataview `writeRecordValuesMany`，把 record field writes 收进 dataview ports 扩展层。
7. 再处理 whiteboard `canvasOrder` ref 编码，把 `canvasRefKey(...)` 从 compile / planner 收回端口层。
8. 再处理 whiteboard `edgeLabels` / `edgeRoute` 的 anchor 适配，把 `toOrderedAnchor(...)` 从 compile/write 移走。
9. 之后视需要决定是否把 dataview `writeViewDisplayInsert` / `writeViewOrderInsert` 一并吸收到 ports 语法糖。
10. 最后清理 whiteboard `compile/write.ts` 中剩余纯转发 helper，能内联的全部内联。

## 12. 最终清单

应上提到 shared core patch mode：

- dataview `createEntityPatch` -> `@shared/core/json.diff(base, next)`

应上提到 shared compile control 中轴：

- dataview `pushIssue` / `issue` / `reportIssues` -> shared `ctx.issue(...)`
- whiteboard `failInvalid` / `failCancelled` -> shared `ctx.invalid(...)` / `ctx.cancelled(...)`
- dataview `requireValue` -> shared `ctx.require(...)` / `ctx.expect(...)`

应上提到 reader 中轴：

- dataview `resolveTarget` -> `ctx.reader.records.resolveTarget(...)`

应删除的 whiteboard planner 桥接层：

- `runCustomPlanner`
- `WhiteboardCustomPlanContext`
- `WhiteboardCustomOperation`
- `mutation/planner/canvas.ts`
- `mutation/planner/types.ts`

应并回 compile 或降级成 compile 内部 helper 的 whiteboard planner：

- `planCanvasOrderMove` -> 直接并回 `compile/canvas.ts`
- `planMindmapCreate` -> 直接并回 `compile/mindmap.ts`
- `planMindmapLayout` -> 直接并回 `compile/mindmap.ts`
- `planMindmapTopicMove` -> 直接并回 `compile/mindmap.ts`
- `planMindmapMove` -> 降级成 compile 内部 helper
- `planMindmapDelete` -> 降级成 compile 内部 helper
- `planMindmapTopicDelete` -> 降级成 compile 内部 helper
- `planMindmapTopicPatch` -> 降级成 compile 内部 helper
- `planMindmapTopicInsert` -> 降级成 `compile/mindmap.ts` 内部 helper
- `planMindmapBranchPatch` -> 降级成 `compile/mindmap.ts` 内部 helper
- `planMindmapTopicCollapse` -> 降级成 `compile/mindmap.ts` 内部 helper
- `planMindmapRestore` -> 直接删除
- `planMindmapTopicRestore` -> 直接删除
- `planner/common.ts` -> 迁出 planner 目录

应上提到 domain mutation ports 中轴：

- dataview `writeRecordValuesMany`
- whiteboard `canvasOrder` ref 编码
- whiteboard `edgeLabels` anchor 适配
- whiteboard `edgeRoute` anchor 适配

可选上提：

- dataview `writeViewDisplayInsert`
- dataview `writeViewOrderInsert`
- dataview `writeViewUpdate`

不应上提：

- whiteboard `requireXxx`

应直接删除而不是上提：

- whiteboard `compile/write.ts` 中所有纯 `program.xxx` 转发 helper
