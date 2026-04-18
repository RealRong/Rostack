# DATAVIEW Empty Last 与 Record Create 最终架构

## 1. 目标

本文档统一收敛两件事：

- dataview 的 view sort 采用统一的 `empty last` 语义
- dataview 的 `new record` 采用统一的跨视图创建架构

目标不是做局部补丁，而是给出一套可长期复用、复杂度低、能覆盖 table / kanban / gallery / toolbar 的最终方案。

## 2. 最终结论

最终结论先写清楚：

- 所有 view sort 统一采用 `empty last`
- `empty` 不参与升序 / 降序翻转
- 升序 / 降序只影响有值 record 之间的顺序
- `new record` 不通过伪造字段值来控制显示位置
- engine `active.records.create(...)` 继续只负责创建真实数据
- React 侧新增统一的 create runtime，但明确不做 `creation pin`
- 新 record 创建后立即进入真实 group / sort
- 若真实排序导致新 record 跳位，接受该行为，不额外引入临时展示位置机制

这两件事必须一起看：

- `empty last` 解决“空值排序不要乱跳”
- 简化后的 create runtime 解决“所有入口走同一套创建时序”

两者职责不同，但当前阶段只落地前者与最小 create runtime，不做 `creation pin`。

## 3. Empty Last 统一语义

### 3.1 规则

所有 dataview view sort 统一采用以下规则：

1. 两边都 empty，比较结果为相等
2. 一边 empty，一边 non-empty，empty 永远排在后面
3. 两边都 non-empty，再按字段本身的比较规则比较
4. `asc / desc` 只作用于第 3 步
5. 若字段值比较相等，则回退到稳定顺序，建议继续使用 record document order

### 3.2 语义解释

这意味着：

- 升序时，empty 不会跑到最前面
- 降序时，empty 也不会跟着翻转到最前面
- empty 不是一个真正的业务值，而是缺失值
- 缺失值应固定在结果尾部，而不是参与方向翻转

### 3.3 适用范围

长期建议直接统一到所有可排序字段，而不是只改个别字段：

- `title`
- `text`
- `number`
- `date`
- `select`
- `status`
- `multiSelect`
- 未来其他支持 sort 的字段类型

理由很简单：

- 产品语义更一致
- 用户心智更稳定
- 不需要记忆“哪类字段 empty 会翻转、哪类不会”

### 3.4 与 Notion 对齐的意义

这套规则更接近用户在 Notion 里的实际感受：

- title 空值不会因为升序被顶到最前面
- select/status 空值不会因为方向变化而来回跳
- 切换升降序时，用户只会看到“有值数据”的顺序变化

### 3.5 与 New Record 的关系

`empty last` 对 `new record` 有直接好处：

- 新建 record 初始 title 为空时，不会因为 `title asc` 跑到顶部
- 新建 record 初始 sort field 为空时，也更不容易产生违和跳动

这已经能显著改善 `new record` 的体验。

原因：

- 当前 dataview 的主要违和感，很多都来自空值在升降序中来回翻转
- 一旦统一 `empty last`，大部分“新建后瞬间跑到最前面”的问题都会自然消失
- 剩余少量“创建后立刻按真实排序跳位”的情况，当前明确接受，不再额外做 `creation pin`

## 4. New Record 最终架构

### 4.1 设计原则

`new record` 的长期设计必须满足以下原则：

- record 的真实位置永远由真实数据 + view.group + view.sort 决定
- 创建入口表达的是“当前从哪里发起创建”，不是“修改业务字段来伪造位置”
- 创建后的显示位置立即服从真实 group / sort，不引入额外临时位置层
- engine 不承载 UI 临时展示逻辑
- table / kanban / gallery / toolbar 使用同一套创建协议

### 4.2 明确不做的事

以下方向不应采用：

- 不通过修改 title / select / number / date 等字段值来强行把新 record 塞到顶部或底部
- 不在 engine create API 里引入“必须先显示在头部 / 尾部”的持久语义
- 不让每个 view 单独发明一套 `addRow / addCard / addRecordAtTop` API

这些方案短期看起来简单，长期都会让排序、过滤、统计、撤销重做、协作同步变复杂。

## 5. Engine 职责边界

### 5.1 继续保留当前最小 API

engine 继续保留当前最小的 view-contextual create API：

```ts
interface ActiveRecordCreateInput {
  sectionKey?: SectionKey
  before?: ItemId
  set?: Partial<Record<FieldId, unknown>>
}
```

```ts
engine.active.records.create(input?)
```

这个 API 继续只负责：

- 创建真实 record
- 自动写入 group / filter 可唯一推导的默认值
- 在无 sort 且提供 `before` 时补 view order
- 返回 `recordId`

它不负责：

- 先显示在 view 头部
- 先显示在 section 尾部
- 先贴在某条 item 下方
- 打开哪种编辑器
- 何时释放临时展示位置

这些都属于 React 侧交互时序，不属于 engine。

## 6. React Create Runtime

### 6.1 必须新增统一 runtime

React 侧应新增一个与 `valueEditor` / `inlineSession` 同级的 create runtime。

原因：

- table 底部创建需要它
- kanban / gallery 列尾创建需要它
- toolbar 头部创建也需要它
- 这些都属于跨视图交互态，不应塞进 engine，也不应塞进现有 page query/settings route

### 6.2 Runtime 的核心职责

create runtime 只负责三件事：

- 接收创建意图
- 调用 `engine.active.records.create(...)`
- 创建成功后立即打开 editor 或聚焦对应 cell / card

### 6.3 创建意图模型

建议 React 内部统一成一个简单的 intent：

```ts
type CreatePresentationTarget =
  | { kind: 'view-edge', edge: 'start' | 'end' }
  | { kind: 'section-edge', sectionKey: SectionKey, edge: 'start' | 'end' }
  | { kind: 'relative-item', itemId: ItemId, side: 'before' | 'after' }

type CreateIntent = {
  sectionKey?: SectionKey
  set?: Partial<Record<FieldId, unknown>>
  presentAt?: CreatePresentationTarget
  openEditor?: {
    fieldId?: FieldId
    mode?: 'value-editor' | 'inline-title'
    seedDraft?: string
  }
}
```

这里要注意：

- `sectionKey / set` 是数据约束
- `presentAt` 是发起位置语义，不是临时排序语义
- `openEditor` 是纯时序语义

这三者必须分离。

## 7. 明确不做 Creation Pin

### 7.1 当前结论

本文档明确给出当前结论：

- 不做 `creation pin`
- 不做“从某个入口创建，就先固定显示在那个位置直到编辑结束”的机制
- 新 record 创建后立即进入真实 group / sort

### 7.2 原因

原因不是做不到，而是没有必要先把复杂度引进来。

优先级判断如下：

- `empty last` 本身已经能解决大部分最突出的创建跳动问题
- Notion 自身在这类场景里也没有做到绝对稳定的临时固定位置
- `creation pin` 会引入第二层视图投影时序，增加跨 view 复杂度
- 当前更合理的策略是先保持真实排序唯一可信

### 7.3 接受的行为

当前明确接受以下行为：

- 在 section 底部点击 `new record`
- 若 group / filter 会给新 record 自动赋值
- 且这些真实值参与当前 sort
- 那么新 record 可以在创建后立即跳到真实排序位置

这不是 bug，而是当前明确接受的产品语义。

## 8. 各入口的统一映射

### 8.1 Table

- 表头工具栏头部添加：`presentAt = { kind: 'view-edge', edge: 'start' }`
- 某个 section 底部添加：`presentAt = { kind: 'section-edge', sectionKey, edge: 'end' }`
- 某条 row 上方添加：`presentAt = { kind: 'relative-item', itemId, side: 'before' }`
- 某条 row 下方添加：`presentAt = { kind: 'relative-item', itemId, side: 'after' }`

### 8.2 Kanban / Gallery

- 某个 section / column / group 尾部添加：`presentAt = { kind: 'section-edge', sectionKey, edge: 'end' }`
- 某张 card 上下添加：同样使用 `relative-item`

### 8.3 Toolbar

toolbar 只表达“从 view 头部发起创建”，不天然表达 section。

规则应为：

- 非 grouped view：可直接创建，使用 `view-edge start`
- grouped view：若 `sectionKey` 不能由 group/filter/default 唯一推导，则不得静默创建
- 此时应要求用户补一个明确 section，或弹出轻量 section picker

关键点：

- toolbar 的“头部添加”是展示语义
- 它不是 section 选择语义
- grouped view 下不能偷偷猜一个 section

## 9. 视图渲染规则

各视图在渲染时都应遵循同一条规则：

- 只拿 engine 的真实 `records / sections / items`
- 不额外叠加 `creation pin` 或临时位置层
- 新建交互只负责发起创建与打开 editor
- 最终显示顺序始终等于真实 group / sort 结果

也就是说：

- engine 产出的就是真实顺序
- view 渲染不应再叠加第二套局部排序系统

## 10. 推荐时序

统一推荐如下时序：

1. 用户从某个入口发起创建
2. React 生成 `CreateIntent`
3. runtime 调用 `engine.active.records.create(...)`
4. engine 创建真实 record，并自动写入 group / filter 可唯一确定的默认值
5. 新 record 立即进入真实 group / sort 结果
6. React 立即打开 title editor 或主字段 editor
7. 用户编辑

这套时序和用户预期最一致：

- 创建动作先满足真实数据约束
- 真实排序立即生效
- 编辑器紧随其后打开

## 11. 分阶段落地建议

为保持复杂度最低，建议按下面顺序落地：

### 第一阶段

- 统一实现 `empty last`
- 让所有字段 sort 都采用缺失值固定后置

### 第二阶段

- 新增 React create runtime
- 先支持 table section 尾部创建
- 明确不使用 `creation pin`

### 第三阶段

- 把同一套 runtime 扩展到 kanban / gallery
- 接入 toolbar 头部添加

这个顺序最稳，因为：

- `empty last` 是底层纯语义优化，独立且收益明确
- create runtime 是统一入口与打开编辑器的能力
- 不做 `creation pin` 能把 runtime 保持在最低复杂度
- runtime 一旦定型，后续 view 扩展成本会很低

## 12. 最终原则

本文档最终希望固定以下长期原则：

- 缺失值不是业务值，sort 中统一固定后置
- 升序 / 降序只翻转非空值
- 新建 record 的最终显示位置始终服从真实 group / sort
- engine 负责真实数据创建
- React runtime 负责统一创建入口与编辑器打开时序
- 所有 view 共用一套 create runtime，而不是各自发明 API

这套方案同时满足：

- 长期最优
- 结构清晰
- 复杂度低
- 可跨 table / kanban / gallery / toolbar 复用
