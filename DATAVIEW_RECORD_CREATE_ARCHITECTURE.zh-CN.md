# DATAVIEW Record Create Architecture

## 1. 背景

当前 dataview 已经具备完整的：

- active snapshot query / section / item 投影
- group bucket 推导与跨 section 移动
- sort 驱动的重排
- card title inline editing

但还没有一套正式的“新增 record”协议。现状里只有两类能力：

- document 级 `record.create`，只能创建 record，本身不知道 view / group / filter / placement
- active view 级 `items.create` 半成品，只覆盖了按 section 创建时自动写入 group value 的一部分语义

因此目前无法稳定支持下面这类产品行为：

- 在每个 view 的顶部、底部、某条 record 上方、下方新增 record
- group 存在时，自动给新 record 带上当前 bucket 对应的值
- filter 存在时，自动给新 record 带上满足当前视图的初始值
- 新建后立即进入 title 编辑，并在 title 提交后按当前 group / sort 自动重排

本文档先收敛整体方案，不涉及代码实现细节。

## 2. 设计目标

- 把新增 record 定义成 view-contextual create，而不是裸 `record.create`
- 同一套 create 协议同时服务 table / kanban / gallery
- 创建时可表达顶部、底部、上方、下方等 placement
- 自动合成 group-derived defaults 与 filter-derived defaults
- 新建后立即进入编辑态
- title 或其他关键字段提交后，由现有 derived query / group / sort 机制自然完成重排
- 不引入第二套“假 record truth”，仍以 document truth 为唯一真实来源

## 3. 非目标

- 第一版不做完全 Notion 式的前端临时假行 / 假卡 overlay
- 第一版不尝试从所有 filter 规则反推默认值
- 第一版不处理 calendar 视图
- 第一版不把“新增位置”做成新的 document truth；最终 document 里仍只有 record + view.orders

## 4. 现状判断

### 4.1 document create 太底层

当前 `record.create -> document.record.insert` 只负责：

- 创建 record id
- 写入 title / values / meta
- 把 record 插入 document records 表

它不知道：

- 当前 active view 是谁
- 用户是从哪个 section 发起创建
- 想插入某条 record 的上方还是下方
- 当前 view 有哪些 filter / group / sort

所以它只能作为最终落盘动作，不能直接承担产品级新增语义。

### 4.2 active items create 已经说明正确方向

当前 engine 里已经有 `active.items.create(input)` 半成品，说明 create 本来就应该挂在 active view 上下文：

- 它能拿到当前 `state.view / state.query / state.sections / state.items`
- 它已经能按 `section` 把 group bucket 反推回 field value
- 它已经部分消费了 kanban `newRecordPosition`

问题在于它的建模还太窄，只支持：

- `section`
- 可选 `title / values`

还没有正式抽象：

- top / bottom / before / after placement
- filter-derived defaults
- table 上下插入
- 创建后进入编辑态

## 5. 总体方案

核心原则：把“新增 record”定义成 **active view command**，而不是 document command。

推荐统一成一层新的 view-contextual create 语义，例如概念上：

```ts
active.items.insert({
  placement,
  seed,
  edit
})
```

其中：

- `placement` 描述用户想把 record 放到哪里
- `seed` 描述用户显式给出的 title / values
- `edit` 描述创建后是否立即进入编辑态

这个 API 的职责应该是：

1. 基于当前 active view 解析 placement
2. 合成创建默认值
3. 生成底层 `record.create`
4. 在适用时补 `view.patch({ orders })`
5. 返回 `recordId`

真正的数据落盘仍然只依赖已有 action：

- `record.create`
- `view.patch`
- `record.fields.writeMany`

## 6. Placement 建模

### 6.1 统一输入

建议把 create placement 定义成：

```ts
type CreatePlacement =
  | { sectionKey: SectionKey; mode: 'start' }
  | { sectionKey: SectionKey; mode: 'end' }
  | { sectionKey: SectionKey; mode: 'before'; anchorItemId: ItemId }
  | { sectionKey: SectionKey; mode: 'after'; anchorItemId: ItemId }
```

含义如下：

- `start`: 当前 section 顶部
- `end`: 当前 section 底部
- `before`: 某条 item 上方
- `after`: 某条 item 下方

### 6.2 各 view 的映射

table:

- 非 grouped：只有一个 root section
- grouped：每个 section header 下都可发起 `start / end`
- 每条 row 可发起 `before / after`

kanban:

- 每个 column 可发起 `start / end`
- 每张 card 可发起 `before / after`

gallery:

- section header / section empty state 可发起 `start / end`
- 每张 card 可发起 `before / after`
- 内部仍按 section item 线性顺序处理，不按 2D 网格单独建模

### 6.3 Placement 解析结果

placement 解析阶段最终应得到：

- `sectionKey`
- `beforeRecordId?`
- `anchorRecordId?`
- `manualPlacementActive: boolean`

其中 `beforeRecordId` 只在“无 sort、允许 manual order 主导最终顺序”时真正参与 `view.orders` 更新。

## 7. 默认值合成

### 7.1 合成优先级

建议统一为：

`用户显式 seed > group-derived defaults > filter-derived defaults > field default`

说明：

- 用户显式输入永远优先
- group 是“当前 section 语义”，应该高于 filter
- filter 是“当前视图约束”，在不冲突时补足
- field default 只兜底

### 7.2 group-derived defaults

这部分优先复用现有 group write 能力，不新发明一套规则。

当前 group 已经可以把 bucket key 反推回 field value，覆盖：

- title / text / url / email / phone
- number
- date
- select
- status
- multiSelect
- boolean

因此在某个 grouped section 下创建 record 时，应直接根据 `sectionKey + group field` 生成初始值。

语义：

- 若 group field 是 title，则新 record 的初始 title 直接等于当前 bucket 对应值
- 若 group field 是 option-like field，则直接写入对应 option
- 若 group field 是 multiSelect，则把当前 option 加入数组
- 若是 empty bucket，则按 group rule 得到 clear 或空值

### 7.3 filter-derived defaults

filter 目前只有 match 规则，没有“从 filter 反推 create 初始值”的 API，因此必须定义一套“可推导 filter 子集”。

第一版建议只支持：

- `eq` on `title/text/number/date/select/status`
- `checked` / `unchecked` on `boolean`
- `contains` on `multiSelect`，且仅当 option-set 中恰好 1 个 option
- 仅在 `filter.mode === 'and'` 时启用自动补值

第一版明确不支持：

- `neq`
- `contains` on text-like
- `gt/gte/lt/lte`
- `exists_true / exists_false`
- `or`
- 多值 multiSelect `contains`

原因：

- 这些规则虽然能参与过滤，但不能稳定推出一个“自然且单义”的初始值
- 若强行反推，会产生技术上满足过滤、产品上却很奇怪的新增结果

### 7.4 冲突处理

如果 group-derived 与 filter-derived 对同一字段给出不同值，建议第一版采用：

- 直接判定当前 placement 不可创建
- 前端禁用入口或点击后给出明确提示

不建议：

- 静默覆盖
- 先创建再瞬间消失
- 创建后挂一个“不满足当前视图”的脏态

### 7.5 field default

保留现有字段默认值语义作为最后兜底，例如：

- status default option

这部分仍由底层 `record.create` 的已有逻辑负责。

## 8. 排序与 manual placement 的关系

这是 create 设计里最容易混乱的地方，必须提前定清楚。

### 8.1 无 sort

当 view 没有 sort 时：

- `top / bottom / before / after` 都应严格兑现
- engine 在创建后补一次 `view.patch({ orders })`
- 最终可见位置由 `view.orders` 主导

### 8.2 有 sort

当 view 已有 sort 时：

- placement 只用于确定“从哪个 section 发起创建”
- 以及“创建后应该先在哪个 section/哪条上下文里出现”
- 最终位置仍由 sort 决定

换句话说：

- create 可以使用 placement 作为创建上下文
- 但不能承诺“最终排序后仍留在 anchor 上下”

这是和当前 dataview 的 derived query / sort 模型一致的。

## 9. 前端时序

### 9.1 推荐时序

第一版推荐采用“先真实创建，再进入编辑”的链路：

1. 用户点击 add trigger
2. 前端解析 placement
3. 前端请求 active-view create
4. engine dispatch `record.create`，必要时补 `view.patch({ orders })`
5. active snapshot 发布出新的 item
6. 前端根据新 record 进入 title 编辑态
7. 用户提交 title
8. 现有 query / group / sort 派生流程自动完成重排

### 9.2 为什么不做前端假 record

第一版不建议做本地临时假行 / 假卡，原因：

- 当前 active snapshot / selection / inline session / value editor 已经围绕 document truth 建好
- 引入 overlay record 会显著增加 reconcile 成本
- 容易和 selection / focus / item identity 产生双轨状态

现有架构已经足够支撑“真实创建后立即编辑”的体验，没有必要先上复杂版本。

## 10. Notion 式 grouped title create 的落地方式

当按 title group 时，用户在某个 group 里点新建，希望：

- 新 record 先显示在当前 group
- 立刻编辑 title
- 提交后根据真实 title 重新分组

第一版建议的实现方式是：

- 创建时先把 title seed 成当前 group bucket 对应值
- 创建完成后立即进入 title inline editing
- 编辑器默认全选当前 title
- 用户输入并提交后，title 被更新
- group / sort 派生重新计算，record 自动移到目标 group

优点：

- 不需要额外的 pending fake row
- 与现有 group write 能力一致
- 与现有 inline title editor 直接兼容

这和 Notion 的最终体感接近，但实现复杂度明显低很多。

## 11. recordId 与 itemId 的追踪原则

create 流程里前端必须先追踪 `recordId`，不能只追 `itemId`。

原因：

- grouped item projection 是按 section 建的
- record 在 regroup 后，可能映射到新的 itemId
- 如果创建后的 UI 只绑定 itemId，跨 group 重排时可能丢失焦点与编辑会话

因此推荐：

- create command 返回 `recordId`
- 前端短期持有一个 `pendingCreatedRecordId`
- 等 active snapshot 中出现该 record 当前对应的 item 后，再打开 editor / 选中 / reveal
- 后续若 item 因 regroup 改变，也按 `recordId` 重新定位

## 12. 编辑模式设计

### 12.1 table

创建完成后：

- 直接打开 title cell editor
- 若 title 不在当前显示字段中，需要先保证 title 可见，或者至少能 fallback 到 title cell

### 12.2 kanban / gallery

创建完成后：

- 直接进入 card title inline editing
- card 在创建后先处于 edit mode
- 用户提交 title 后退出 inline session

### 12.3 value editor 的时序

前端不需要假设新节点同步渲染完成。

应复用现有策略：

- dispatch create
- 等下一轮 snapshot 发布
- 尝试按 `recordId -> itemId` 打开 editor
- 若锚点未挂载，允许按 frame retry

## 13. UI 触发点建议

### 13.1 table

建议新增 4 类入口：

- 整个 view 顶部 add row
- 整个 view 底部 add row
- grouped section 顶部 add row
- grouped section 底部 add row
- row hover 时显示 above / below add affordance

### 13.2 kanban

建议新增：

- column header 或 footer 的 add card
- empty column 的 add first card
- card hover 时的 above / below 插入 affordance

### 13.3 gallery

建议新增：

- section header / footer add card
- empty section add first card
- card hover 时的 before / after 插入 affordance

## 14. API 分层建议

建议按下面三层拆：

### 14.1 document 层

只保留：

- `record.create`
- `record.fields.writeMany`
- `view.patch`

不感知 placement / section / filter / editing。

### 14.2 active view 层

负责：

- 解析 placement
- 读取当前 `view / query / section / item`
- 合成 group / filter 默认值
- 决定是否补 manual order
- 返回 `recordId`

这是新增 record 的主要语义层。

### 14.3 react 层

负责：

- 渲染 add trigger
- 生成 placement input
- 调用 active-view create
- 根据 `recordId` 追踪 newly created item
- 打开 title editor / inline session
- 维护短生命周期的 create UI state

## 15. 分阶段落地建议

### Phase 1

- 收敛统一 placement 结构
- 把现有 `active.items.create` 扩成正式 create API
- 支持 group-derived defaults
- 支持无 sort 场景下的 top / bottom / before / after
- 创建后进入 title 编辑

### Phase 2

- 引入 filter-derived defaults
- 明确冲突提示与禁用规则
- 把 table / kanban / gallery 三个视图入口补齐

### Phase 3

- 视需要评估是否要补 Notion 式 pending fake row / fake card overlay
- 仅在真实体验差距仍明显时再考虑

## 16. 风险与注意点

- 一旦有 sort，manual placement 不能承诺最终顺序
- grouped create 必须优先以 sectionKey 解释“当前上下文”，不能只看全局 item order
- create 后编辑链路必须按 `recordId` 追踪，而不是只绑死 `itemId`
- filter-derived defaults 一定要控制支持范围，否则会制造大量不可解释行为
- 不要引入第二套 document 外的 record truth

## 17. 最终结论

新增 record 在 dataview 里应被定义为：

- 一套以 active view 为中心的 create 协议
- placement + defaults composition + enter-edit 的组合语义
- 底层仍复用现有 `record.create / view.patch / record.fields.writeMany`
- 重排完全交给现有 derived query / group / sort 系统

第一版最重要的不是做炫的临时假行，而是把下面三件事正式建模：

1. placement
2. group/filter 默认值合成
3. 创建后的 enter-edit 与 `recordId` 追踪

这三件事一旦收敛，table / kanban / gallery 的新增行为就能统一起来，且不会和现有 dataview 架构冲突。
