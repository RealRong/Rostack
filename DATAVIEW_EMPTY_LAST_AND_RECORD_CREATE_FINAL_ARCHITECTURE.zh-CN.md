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
- React 侧新增统一的 create runtime，负责“从哪里创建、先显示在哪里、何时释放临时位置”
- 刚创建的 record 使用短生命周期的 `creation pin`
- `creation pin` 在编辑结束后释放，之后 record 回到真实 sort 位置

这两件事必须一起看：

- `empty last` 解决“空值排序不要乱跳”
- `creation pin` 解决“从哪个入口创建，就先在哪里编辑”

两者互补，但职责不同，不能互相替代。

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

但它不是完整解法。

原因：

- 当前 sort 不一定是空值字段
- 新建 record 的目标位置不只存在于 sort 结果里
- toolbar 头部添加、section 尾部添加、item 上下插入，本质上都是 UI 发起位置语义，不是字段值语义

因此：

- `empty last` 应作为统一排序语义独立落地
- 不应用它取代 `new record` 的位置设计

## 4. New Record 最终架构

### 4.1 设计原则

`new record` 的长期设计必须满足以下原则：

- record 的真实位置永远由真实数据 + view.group + view.sort 决定
- 创建入口表达的是“当前从哪里发起创建”，不是“修改业务字段来伪造位置”
- 创建后的首次编辑位置由前端短生命周期状态托管
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
- 创建成功后登记短生命周期 `creation pin`
- 在编辑结束时释放 pin

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
- `presentAt` 是纯展示语义
- `openEditor` 是纯时序语义

这三者必须分离。

## 7. Creation Pin

### 7.1 定义

创建成功后，runtime 记录一条短生命周期 pin：

```ts
type CreationPin = {
  viewId: ViewId
  recordId: RecordId
  target: CreatePresentationTarget
  releaseOn: 'editor-close'
}
```

它的含义是：

- 这条 record 已经真实存在
- 但在当前 view 中，先按发起位置展示
- 暂时不要立刻服从真实 sort 重排
- 等编辑结束后再回到真实位置

### 7.2 为什么 pin 是最优方案

这是长期最优方案，因为它同时满足：

- 不污染 document truth
- 不污染字段值
- 不污染 engine create API
- 不需要每个 view 各写一套插入位置逻辑
- 可以统一支持 toolbar / table / kanban / gallery

### 7.3 生命周期

默认规则应尽量简单：

- 创建后立即建立 pin
- 打开 title editor 或主字段 editor
- 编辑器关闭后释放 pin

补充清理规则：

- 若 view 切换，清理当前 view 的全部 pin
- 若 record 被删除，清理对应 pin
- 若 editor 未能成功打开，pin 不应长时间保留，应快速回收

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

- 先拿到 engine 的真实 `records / sections / items`
- 再读取 create runtime 的 `creation pin`
- 若某条 record 仍在 pin 生命周期内，则优先按 `presentAt` 投影到临时位置
- pin 释放后，立即回到真实排序结果

也就是说：

- engine 产出的是真实顺序
- view 渲染时额外叠加一个极薄的临时展示层
- 这个展示层只服务“刚创建且正在编辑”的极少量 record

不能把它扩展成第二套常驻排序系统。

## 10. 推荐时序

统一推荐如下时序：

1. 用户从某个入口发起创建
2. React 生成 `CreateIntent`
3. runtime 调用 `engine.active.records.create(...)`
4. engine 创建真实 record，并自动写入 group / filter 可唯一确定的默认值
5. runtime 为新 record 建立 `creation pin`
6. 当前 view 先按 `presentAt` 展示这条 record
7. React 立即打开 title editor 或主字段 editor
8. 用户编辑
9. editor 关闭
10. pin 释放，record 回到真实 group / sort 位置

这套时序和用户预期最一致：

- 先在当前发起位置出现
- 先完成输入
- 再按真实排序归位

## 11. 分阶段落地建议

为保持复杂度最低，建议按下面顺序落地：

### 第一阶段

- 统一实现 `empty last`
- 让所有字段 sort 都采用缺失值固定后置

### 第二阶段

- 新增 React create runtime
- 先支持 table section 尾部创建
- 使用 `creation pin + editor-close release`

### 第三阶段

- 把同一套 runtime 扩展到 kanban / gallery
- 接入 toolbar 头部添加

这个顺序最稳，因为：

- `empty last` 是底层纯语义优化，独立且收益明确
- create runtime 是交互层能力，适合在排序语义稳定后引入
- runtime 一旦定型，后续 view 扩展成本会很低

## 12. 最终原则

本文档最终希望固定以下长期原则：

- 缺失值不是业务值，sort 中统一固定后置
- 升序 / 降序只翻转非空值
- 新建 record 的“首次展示位置”是交互态，不是数据态
- engine 负责真实数据创建
- React runtime 负责创建时序与临时展示位置
- 所有 view 共用一套 create runtime，而不是各自发明 API

这套方案同时满足：

- 长期最优
- 结构清晰
- 复杂度低
- 可跨 table / kanban / gallery / toolbar 复用

