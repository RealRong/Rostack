# dataview-engine 最终形态与实施方案

## 最终形态

目标不是继续微调当前实现，而是把 `dataview-engine` 收敛成一条明确的 staged projection pipeline：

`mutation engine -> engine projection(document -> index -> active -> publish) -> engine source`

这里的关键点只有四个。

### 1. 只有一份 projection runtime

最终只保留一份 `createDataviewProjection()`。

不再允许存在：

- 独立的 `document source projection`
- 独立的 `active source projection`
- `createEngineSource()` 自己再发明一套 selector runtime

`engine.source` 可以保留对外接口名字，但它只能是同一份 projection stores 的薄适配层，不再是第二套状态系统。

### 2. projection phase 固化为四段

最终 phase 顺序应当明确为：

1. `document`
2. `index`
3. `active`
4. `publish`

每一段只负责一类状态：

- `document`
  负责把 commit 输入 document、resolved context、document-facing published stores 固化进 projection state。

- `index`
  负责维护 records/search/bucket/sort/calculation 这些中间索引状态。`index` 应成为一级 projection state，而不是 `active` phase 内部顺手计算的副产物。

- `active`
  负责 query/membership/summary 这些真正的 domain state 推导。这里不再直接承担 UI-facing published model 的拼装。

- `publish`
  负责把 active domain state 显式投影成外部消费状态，包括：
  `view`、`query`、`table/gallery/kanban`、`records.matched/ordered/visible`、`fields/sections/items/summaries`。

也就是说，最终的 projection 不是“document + active 两段大杂烩”，而是显式四段流水线。

### 3. source 只消费 published state

最终 `EngineSource` 不应直接混读：

- document 原始结构
- active 内部 state
- active snapshot
- projection stores 的局部实现细节

它应该只依赖两类 published stores：

- `stores.document.*`
- `stores.publish.*` 或 `stores.activePublished.*`

然后只补少量便利派生：

- `OrderedKeyedCollection`
- `ItemList`
- `SectionList`
- `ValueRef -> value` 这种纯读取映射

换句话说，`source` 是 published read model adapter，不是 runtime assembler。

### 4. publish 从 `active/` 目录中抽离

最终 `publish` 不应继续挂在 `src/active/publish/*` 下。

原因不是目录美观，而是语义边界：

- `active` 是 domain derivation
- `publish` 是 external read-model projection

它们不是同一个层级。

建议最终迁移到：

- `src/projection/publish/*`
- 或 `src/publish/*`

总之要从 `active/` 中抽出来，明确它属于 engine projection 的最后一段，而不是 active 子系统内部实现。

## publish 当前的核心问题

### 问题一：publish 仍在自己做过多 diff

当前 `dataview/packages/dataview-engine/src/active/publish/sections.ts` 的复杂度偏高，根本原因不是代码风格，而是 publish 还在自己承担大量“状态比较”和“补推导”职责。

典型信号包括：

- 维护 `previousPublishedSections` / `previousItems`
- 本地计算 `addedItemIds` / `removedItemIds` / `changedSectionIds` / `removedSectionIds`
- 根据 `previousSection` 和 `nextRecordIds` 再做 subsequence removal 推断
- 自己决定何时 rebuild placement map、何时 patch map

这说明 publish 层并没有被当成“上游 change 的消费者”，而仍在把自己当成“二次 reconcile 引擎”。

这会导致两个问题：

1. 复杂度重复
   `query/membership/summary/index` 已经知道哪些东西变了，publish 又重新猜一遍。

2. 边界倒置
   publish 本该只负责“把变化投影出去”，结果还要反向推断“变化到底是什么”。

### 问题二：`publish/sections.ts` 对上游 change 利用不够

当前 publish 完全可以更多依赖这些上游结果：

- `index.delta`
- `queryDelta`
- `membershipDelta`
- `summaryDelta`
- `active.changes`

尤其是：

- section 的变更边界，本质上应该由 `membershipDelta` 给出
- item 的增删与归属变化，本质上应该由 membership / query 的增量结果给出
- summaries 的变化边界，本质上应该由 `summaryDelta` 给出

如果这些 change 能力已经存在，上游就应该输出足够强的 publish contract，而不是让 `publish/sections.ts` 再去本地猜测。

### 问题三：publish 目前仍然掺杂“缓存策略”和“投影语义”

例如 `sections.ts` 里这些判断：

- 是否可以复用 `previous`
- 是否要 rebuild placement state
- 是否按 touched count 切换策略

这些逻辑本质上不是“section publish 语义”，而是“增量应用策略”。

最终应当拆分：

- publish contract：上游告诉 publish 哪些 section/item 发生了何种变化
- publish apply：把这些变化应用到 published state
- publish cache policy：决定是 patch 还是 rebuild

如果这三件事都混在一个文件里，代码永远会显得重。

## 最终的 publish 设计原则

### 1. publish 不重新推断变化

最终 publish 的默认原则应当是：

`publish consumes change, it does not rediscover change`

具体要求：

- `query` 产出 record-level publish contract
- `membership` 产出 section/item-level publish contract
- `summary` 产出 summary-level publish contract
- `publish` 只消费这些 contract，并负责生成稳定的 published stores

也就是说，publish 不再依赖 `previous` 和 `next` 做大范围比较来“猜”变化。

### 2. publish 内部尽量用 patch contract，而不是对象比较

最终 publish 需要的不是：

- `previousSection`
- `nextRecordIds`
- `try to infer removedItemIds`

而是更直接的输入，例如：

- `section order changed`
- `section removed ids`
- `section touched ids`
- `record moved from A to B`
- `record inserted before X`
- `summary changed ids`

有了这种 contract，publish 可以更像 apply 阶段，而不是 diff 阶段。

### 3. `deltaPublish.ts` 应成为 publish 的核心基础设施

`dataview/packages/dataview-engine/src/active/publish/deltaPublish.ts` 现在只提供很薄的 `publishList` / `publishStruct`。

最终它应当扩成 publish 基础设施层，承担：

- value patch apply
- ordered list patch apply
- keyed family patch apply
- struct field reuse
- patch vs rebuild policy

这样 `publish/sections.ts`、`publish/summaries.ts`、`publish/base.ts` 都能共享同一套增量应用语义，而不是各自写局部判断。

### 4. published state 应成为 projection state 的一级成员

最终不能再让 stores 直接从 `active.snapshot` 读大量字段。

应该明确有一块 state，例如：

- `state.documentPublished`
- `state.publish` 或 `state.published`

然后：

- `document` phase 写 `documentPublished`
- `publish` phase 写 `published`
- `stores` 只读取这两块 published state

这样 source 才会真正只依赖 published model，而不是不小心耦合 internal state。

## 实施方案

下面只给最终建议的实施顺序，不讨论过渡设计。

### 第一阶段：把单 runtime 固化为四 phase

目标：把现在已经统一成一份的 projection，进一步收敛成明确的 four-phase pipeline。

要做的事：

- 在 `createDataviewProjection()` 中正式拆出 `document -> index -> active -> publish`
- `document` phase 只写 document context / document published state
- `index` phase 只写 index state 与 index delta
- `active` phase 只写 query/membership/summary domain state
- `publish` phase 只写 published active state

完成标准：

- `ensureDataviewIndex()` 不再在 `active` phase 内部被顺手调用，而是变成独立 phase 主体
- `publishActiveView()` 不再是 active phase 内部步骤，而成为单独 phase 核心

### 第二阶段：定义上游到 publish 的标准 change contract

目标：让 publish 停止做本地 diff 推断。

要做的事：

- 为 `query`、`membership`、`summary` 明确 publish-facing delta contract
- 梳理哪些 delta 已经存在，哪些字段还不够表达 publish 所需语义
- 缺什么补什么，但补在上游 phase 输出里，不补在 publish 本地推断里

建议优先落实的 contract：

- `query -> visible records delta`
- `membership -> sections/items delta`
- `summary -> summary ids delta`

完成标准：

- `publish/sections.ts` 不再通过 `previousSection + nextRecordIds` 猜删除项
- `publish` 文件中对 `previous/next` 的全量比较显著减少

### 第三阶段：重写 publish apply 层

目标：让 publish 变成“应用 change 到 published state”的薄层。

要做的事：

- 抽出 publish 基础设施层，升级 `deltaPublish.ts`
- 把 `sections.ts`、`summaries.ts`、`base.ts` 改成基于 patch contract 的 apply 逻辑
- 把 patch vs rebuild 策略收敛到统一 helper，而不是散落在每个 publish 文件里

完成标准：

- `publish/sections.ts` 的职责从“reconcile + cache policy + state apply”缩到“section/item published patch apply”
- `publish` 子模块之间共享统一的增量应用模型

### 第四阶段：把 publish 从 `active/` 抽离

目标：修正目录语义，让文件结构体现真实边界。

建议迁移：

- `src/active/publish/base.ts` -> `src/projection/publish/base.ts`
- `src/active/publish/sections.ts` -> `src/projection/publish/sections.ts`
- `src/active/publish/summaries.ts` -> `src/projection/publish/summaries.ts`
- `src/active/publish/deltaPublish.ts` -> `src/projection/publish/core.ts` 或 `src/publish/core.ts`

同时：

- `itemIdPool` 如果只是 publish 过程内部状态，也应迁出 `active/`

完成标准：

- `active/` 目录内只保留 active domain derivation
- publish 目录单独表达“external read-model projection”

### 第五阶段：把 source 收成纯薄适配层

目标：让 `createEngineSource()` 退化成无业务逻辑组合层。

保留的职责：

- `ValueRef -> value`
- `EntitySource -> list`
- `items/sections/fields` 的只读便利封装

移除的职责：

- 自己决定哪些 runtime state 应该被公开
- 自己发明 selector / diff / update 语义

完成标准：

- `createEngineSource()` 只读 `projection.stores.document.*` 与 `projection.stores.publish.*`
- `EngineSource` 不再知道 internal active/index/document 结构

## 最终验收标准

完成后，dataview-engine 应满足下面这些条件：

- runtime 只有一份 projection
- projection phase 固定为 `document -> index -> active -> publish`
- index 是一级 state，不再是 active 的隐式内部步骤
- publish 是一级 phase，不再挂在 `active/` 目录里
- publish 默认消费上游 change contract，不再本地重做大范围 diff
- source 只消费 published stores，不再形成第二套状态系统
- performance/trace 仍保持清理状态，未来需要时作为外插层重新设计

## 一句话结论

最终目标不是“把现在的代码整理得稍微顺一点”，而是把 dataview-engine 收敛成：

`one runtime, four phases, published-state-first, change-driven publish`

只有做到这一步，`publish/sections.ts` 这类文件的复杂度才会真正下降，而不是在局部继续修修补补。
