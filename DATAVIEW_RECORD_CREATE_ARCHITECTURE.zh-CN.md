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
- 创建时可表达顶部、底部、上方、下方等 position
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

- top / bottom / before / after position
- filter-derived defaults
- table 上下插入
- 创建后进入编辑态

## 5. 最终 API 设计

核心结论先写清楚：

- 不需要 `add new card`
- 不需要 `add row`
- 不需要 `table.addRow / kanban.addCard / gallery.addCard`
- 不需要把“进入编辑态”塞进 engine API

最终只保留两层 API：

- document 级原始 `records.create`
- active-view 级通用 `active.records.create`

其中：

- `records.create` 继续是裸 document create，只负责建 record
- `active.records.create` 是唯一的 view-contextual create API

### 5.1 公开 API

```ts
interface ActiveRecordCreateInput {
  sectionKey?: SectionKey
  before?: ItemId
  set?: Partial<Record<FieldId, unknown>>
}

type ActiveRecordCreate = (
  input?: ActiveRecordCreateInput
) => RecordId | undefined
```

建议最终挂载位置：

```ts
engine.active.records.create(input?)
```

### 5.2 为什么这是最终定稿

这个 API 足够简单，同时能长期复用：

- `create` 的目标对象本质上是 record，不是 card，不是 row
- `sectionKey + before` 只表达 view 上下文，不承载 UI 行为
- `set` 统一表达初始字段值，包含 `title`
- 返回值只要 `recordId`
- 进入编辑态、选中、reveal 都留给 React 层处理

这样可以避免以后出现一堆语义重复的 API：

- `addNewCard`
- `addRow`
- `insertCardBefore`
- `insertRowAfter`

这些都应只是 UI trigger，不应成为 engine public API。

### 5.3 `sectionKey` 与 `before` 字段解释

最终 API 只保留一套最小位置语义：

- `sectionKey`: 指定从哪个 section 发起创建
- `before`: 指定插到某条 item 前面

约束：

- 若提供 `before`，则表示“插到该 item 前面”
- 若不提供 `before`，则表示“插到该 section 末尾”
- 若提供 `before`，`sectionKey` 可省略，由该 item 反推 section
- 若某个 section 为空，则必须显式提供 `sectionKey`

对应 UI 语义时，React 层先做归一化：

- section 顶部: `before = section.items.first`
- section 底部: `before = undefined`
- item 上方: `before = currentItem`
- item 下方: `before = currentItem.next ?? undefined`

也就是说，engine 最终只理解“before 某个 item”这一种位置模型。

### 5.4 set 字段解释

`set` 统一表示调用方显式指定的初始字段值。

特点：

- 使用 `FieldId` 作为 key
- `title` 直接走 `TITLE_FIELD_ID`
- 自定义字段与 title 走同一套入参结构

这样 API 不需要再单独暴露：

- `title`
- `values`
- `seed`

引擎内部再把 `set.title` 与 custom field values 拆回到底层 `record.create` 即可。

### 5.5 engine 的职责边界

`engine.active.records.create` 负责：

1. 解析 `sectionKey` 与 `before`
2. 读取当前 active view / query / section / item
3. 合成最终初始值
4. 调用底层 `record.create`
5. 在适用时补 `view.patch({ orders })`
6. 返回 `recordId`

它不负责：

- 打开编辑器
- 进入 inline edit
- 选中刚创建的 item
- reveal 到视口

这些全部交给 React 层。

## 6. Position 建模

### 6.1 统一输入

最终 API 收敛为：

```ts
interface ActiveRecordCreateInput {
  sectionKey?: SectionKey
  before?: ItemId
  set?: Partial<Record<FieldId, unknown>>
}
```

它能覆盖：

- 当前 section 顶部
- 当前 section 底部
- 某条 item 上方
- 某条 item 下方

### 6.2 各 view 的映射

table:

- 非 grouped：只有一个 root section
- grouped：每个 section header 下都可发起 section create
- 每条 row 可发起 `before / after`

kanban:

- 每个 column 可发起 section create
- 每张 card 可发起 `before / after`

gallery:

- section header / section empty state 可发起 section create
- 每张 card 可发起 `before / after`
- 内部仍按 section item 线性顺序处理，不按 2D 网格单独建模

### 6.3 Placement 解析结果

position 解析阶段最终应得到：

- `sectionKey`
- `beforeRecordId?`
- `manualPositionActive: boolean`

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

- 直接判定当前 create context 不可创建
- 前端禁用入口或点击后给出明确提示

不建议：

- 静默覆盖
- 先创建再瞬间消失
- 创建后挂一个“不满足当前视图”的脏态

### 7.5 field default

保留现有字段默认值语义作为最后兜底，例如：

- status default option

这部分仍由底层 `record.create` 的已有逻辑负责。

## 8. 排序与 manual position 的关系

这是 create 设计里最容易混乱的地方，必须提前定清楚。

### 8.1 无 sort

当 view 没有 sort 时：

- `before / section end` 都应严格兑现
- engine 在创建后补一次 `view.patch({ orders })`
- 最终可见位置由 `view.orders` 主导

### 8.2 有 sort

当 view 已有 sort 时：

- `sectionKey / before` 只用于确定“从哪个 section 发起创建”
- 以及“创建后应该先在哪个 section/哪条上下文里出现”
- 最终位置仍由 sort 决定

换句话说：

- create 可以使用 `sectionKey / before` 作为创建上下文
- 但不能承诺“最终排序后仍留在 anchor 上下”

这是和当前 dataview 的 derived query / sort 模型一致的。

## 9. 前端时序

### 9.1 推荐时序

第一版推荐采用“先真实创建，再进入编辑”的链路：

1. 用户点击 add trigger
2. 前端构造 `sectionKey / before`
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

先明确边界：

- “创建后进入编辑态”是前端行为，不是 engine API 行为
- engine API 只返回 `recordId`
- React 层根据 `recordId` 决定下一步打开什么 editor

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

## 13. UI 范围约束

本轮方案不进入 UI 设计，也不产出具体 React 组件方案。

这里明确约束如下：

- 不设计 table 的 add row 入口样式
- 不设计 kanban 的 add card 入口样式
- 不设计 gallery 的 add card 入口样式
- 不设计 hover affordance
- 不设计 section header / empty state / footer 的 create 入口
- 不设计按钮文案、布局、交互细节与视觉反馈

原因：

- 当前阶段的目标是先收敛 create 协议与 engine 语义
- UI 入口必须建立在最终 API 与时序稳定之后
- 现在提前做 UI 设计，会把协议层和表现层重新耦合起来

因此本文档对 UI 只保留一个结论：

- 未来任何 add trigger，都只能作为 `engine.active.records.create` 的调用方
- UI 本身不再倒逼 engine 增加新的 view-specific API

## 14. API 分层建议

建议按下面三层拆：

### 14.1 document 层

只保留：

- `record.create`
- `record.fields.writeMany`
- `view.patch`

不感知 `sectionKey / before` / filter / editing。

### 14.2 active view 层

负责：

- 暴露唯一公开 API：`active.records.create`
- 解析 `sectionKey / before`
- 读取当前 `view / query / section / item`
- 合成 group / filter 默认值
- 决定是否补 manual order
- 返回 `recordId`

这是新增 record 的主要语义层。

### 14.3 react 层

负责：

- 渲染 add trigger
- 生成 `sectionKey / before`
- 调用 `engine.active.records.create`
- 根据 `recordId` 追踪 newly created item
- 打开 title editor / inline session
- 维护短生命周期的 create UI state

当前实施阶段明确不包含：

- 不新增 React 侧 add row / add card / add record 组件
- 不新增 hover add affordance
- 不新增 section header / empty state create 入口

也就是说，React 层目前只保留后续接入点与时序约束，不进入具体 UI 组件实现。

### 14.4 明确不保留的 API

下面这些都不应成为最终公开 API：

- `active.items.create`
- `active.items.insert`
- `table.addRow`
- `kanban.addCard`
- `gallery.addCard`
- `addNewCard`

理由：

- 它们要么是 view-specific 命名
- 要么把 record create 错误地建模成 item / card create
- 要么会导致同一语义出现多套重复入口

## 15. 实施方案

本节改为当前可执行的实施定稿，不再保留模糊的“顺带实现 UI”空间。

### Phase 1

- 收敛统一 `sectionKey + before` 结构
- 增加 `engine.active.records.create`
- 让现有 `active.items.create` 退回 internal compatibility 层或移除
- 支持 group-derived defaults
- 支持无 sort 场景下的 `before / section end`
- 明确创建后进入编辑的前端时序约束
- 不实现 React 侧添加 record 组件
- 不实现具体 add trigger UI

### Phase 2

- 引入 filter-derived defaults
- 明确冲突提示与禁用规则
- 在协议稳定后单独设计 table / kanban / gallery 的 UI 入口
- 视需要补齐 React 侧 add trigger 组件

### Phase 3

- 视需要评估是否要补 Notion 式 pending fake row / fake card overlay
- 仅在真实体验差距仍明显时再考虑

### 15.1 本轮实际交付边界

当前阶段应交付的只有下面这些内容：

- 最终 API 形态
- engine 层职责边界
- position 归一化规则
- group-derived defaults 规则
- filter-derived defaults 支持范围
- sort 与 manual position 的边界
- create 后进入编辑的时序约束
- recordId 优先追踪原则

当前阶段明确不交付：

- React add trigger 组件
- 任何具体按钮、入口、hover affordance
- 任何视觉样式、动效、文案
- 任何假行 / 假卡 overlay 实现

### 15.2 实施顺序

建议实际执行顺序固定为：

1. 定稿 `engine.active.records.create`
2. 定稿 `sectionKey / before / set` 解析规则
3. 落地 group-derived defaults
4. 落地无 sort 场景下的 manual order 规则
5. 补 filter-derived defaults
6. 最后才开始考虑 React 入口与 UI 组件

这个顺序不应打乱。任何 UI 侧实现都不应先于协议层稳定。

## 16. 风险与注意点

- 一旦有 sort，manual position 不能承诺最终顺序
- grouped create 必须优先以 sectionKey 解释“当前上下文”，不能只看全局 item order
- create 后编辑链路必须按 `recordId` 追踪，而不是只绑死 `itemId`
- filter-derived defaults 一定要控制支持范围，否则会制造大量不可解释行为
- 不要引入第二套 document 外的 record truth

## 17. 最终结论

新增 record 在 dataview 里的最终 API 结论是：

- 只有一个公开的 view-contextual create API：`engine.active.records.create`
- 没有 `add new card` 这类 view-specific API
- 没有把“进入编辑态”揉进 engine API
- 底层仍复用现有 `record.create / view.patch / record.fields.writeMany`

最终定稿：

```ts
interface ActiveRecordCreateInput {
  sectionKey?: SectionKey
  before?: ItemId
  set?: Partial<Record<FieldId, unknown>>
}

type ActiveRecordCreate = (
  input?: ActiveRecordCreateInput
) => RecordId | undefined
```

这个设计成立的原因很简单：

1. 命名是 record-centric，不是 card-centric
2. 入参只有 `sectionKey + before + set`，足够简单
3. 引擎只负责创建与落位，不负责 UI 编辑态
4. table / kanban / gallery 都能复用同一套语义
5. 后续即使扩到更多 view，也不用再发明新的 `addXxx` API

后续继续设计与实现时，都应以这个 API 定稿为准。
