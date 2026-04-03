# gallery 卡片 title inline edit 与空属性入口改造方案

## 目标

把 gallery 卡片改造成更接近 Notion 的交互：

- title 不再复用 `CardField`
- title 默认直接按 gallery 自己的样式渲染
- 鼠标悬浮卡片时，右上角出现编辑入口
- 点击编辑入口后进入卡片局部编辑模式
- 编辑模式下：
  - title 变成 `input`
  - 空值属性显示为“添加 xxx”入口，并带属性类型图标
- 非编辑模式下：
  - 空值属性不显示

这次方案只覆盖 gallery，不同步改 kanban。

## 当前现状

当前实现位于：

- [dataview/src/react/views/gallery/components/Card.tsx](/Users/realrong/Rostack/dataview/src/react/views/gallery/components/Card.tsx)
- [dataview/src/react/views/gallery/components/CardSurface.tsx](/Users/realrong/Rostack/dataview/src/react/views/gallery/components/CardSurface.tsx)
- [dataview/src/react/views/shared/CardField.tsx](/Users/realrong/Rostack/dataview/src/react/views/shared/CardField.tsx)

当前问题：

1. title 仍然走 `CardField`

- 这意味着 title 仍然沿用普通 field 的双击打开 `valueEditor`
- gallery title 的视觉与交互不能单独演进

2. 空值属性在浏览态没有正确的展示策略

- 现在空值属性统一显示 `—`
- 这更像“只读列表”
- 不符合 gallery 卡片中“浏览态尽量简洁、编辑态再暴露补充入口”的预期

3. gallery 卡片没有局部编辑模式

- 卡片只有 selection / drag 行为
- 没有单独的 hover action 入口

4. 现在 `CardSurface` 是纯视觉层，但尚未承载“view mode / edit mode”切换

- 这并不是坏事
- 说明改造空间明确

## 设计结论

### 1. `Card.tsx` 与 `CardSurface.tsx` 继续分层

保留两层，不合并。

职责划分：

- `Card.tsx`
  - 负责 gallery 卡片外层交互壳
  - 负责 hover 状态
  - 负责 edit mode 开关
  - 负责在编辑态下屏蔽 drag / selection 的部分行为

- `CardSurface.tsx`
  - 负责卡片表面渲染
  - 负责 view mode / edit mode 的视觉切换
  - 负责 title 显示 / title input
  - 负责属性区渲染

原因：

- 右上角编辑入口是整张卡片级别的 affordance，不是单个 field 的职责
- edit mode 会影响卡片外层 pointer 行为，状态不适合塞进共享 `CardField`
- overlay 仍然需要复用 `CardSurface`，但不需要复用 edit state

### 2. title 从 `CardField` 中拆出

gallery title 不再使用：

```tsx
<CardField ... />
```

而改为：

- view mode：`div` 渲染 title 文本
- edit mode：`Input` 渲染 title 输入框

原因：

- title 是 gallery 卡片的主要视觉元素，不应被普通属性 field 抽象绑住
- 未来如果要继续做：
  - 自动聚焦
  - Enter 提交
  - Escape 取消
  - blur 提交
  - placeholder 风格
  - 空 title 高亮
  都应该是 title 自己的行为

### 3. 非 title 属性继续复用 `CardField`

保留：

- 非空属性继续复用 `CardField`
- 这部分仍然沿用现有 `valueEditor.open(...)`

但空值属性不再直接复用 `CardField` 的 `emptyPlaceholder="—"` 这一路。

同时，不建议直接给 `CardField` 增加：

- `isEditing`

因为这会把以下职责一起塞进 `CardField`：

- 是否显示空值属性
- 空值时显示 `—` 还是显示“添加 xxx”
- 当前是浏览态还是卡片局部编辑态
- 不同视图的属性槽位布局策略

这些都不是 field value renderer 的职责，而是 card property slot 的职责。

结论：

- `CardField` 继续只负责“一个已经决定要显示的 field”
- 另起一层共享组件负责“这个属性槽位在当前模式下怎么显示”

### 4. 空值属性只在编辑模式下显示“添加 xxx”入口

当属性值为空时：

- view mode：
  - 不显示这个属性
- edit mode：
  - 显示一个按钮或伪按钮行
  - 展示内容：
    - kind icon
    - `添加 {property.name}`

例如：

- `添加 多选`
- `添加 数字`
- `添加 状态`

图标直接复用：

- `meta.property.kind.get(property.kind).Icon`

现有引用点可参考：

- [dataview/src/meta/property.tsx](/Users/realrong/Rostack/dataview/src/meta/property.tsx)
- [dataview/src/react/page/features/viewQuery/PropertyPicker.tsx](/Users/realrong/Rostack/dataview/src/react/page/features/viewQuery/PropertyPicker.tsx)

## 建议新增的共享抽象

### `CardPropertySlot`

建议新增一个共享组件，例如：

- `dataview/src/react/views/shared/CardPropertySlot.tsx`

它的职责是：

- 根据当前 mode 决定属性槽位如何展示
- 根据 value 是否为空决定：
  - 隐藏
  - 渲染 `CardField`
  - 渲染“添加 xxx”入口

建议输入形状：

```ts
interface CardPropertySlotProps {
  field: ViewFieldRef
  property: GroupProperty
  value: unknown
  fieldPropertyIds: readonly PropertyId[]
  mode: 'view' | 'edit'
  density?: 'default' | 'compact'
  valueClassName?: string
  onSelect?: () => void
}
```

内部规则：

- `mode === 'view'`
  - 有值：渲染 `CardField`
  - 空值：返回 `null`

- `mode === 'edit'`
  - 有值：渲染 `CardField`
  - 空值：渲染 `AddCardPropertyTrigger`

### `AddCardPropertyTrigger`

建议再新增一个很小的共享组件，例如：

- `dataview/src/react/views/shared/AddCardPropertyTrigger.tsx`

职责：

- 渲染 kind icon
- 渲染 `添加 {property.name}`
- 作为 anchor element 打开对应 field 的 `valueEditor`

这样 gallery 和未来的 kanban 局部编辑态都可以复用同一套规则，但仍然保留各自的布局自由度。

## 建议的组件职责调整

### `Card.tsx`

新增本地状态：

- `hovered: boolean`
- `editing: boolean`
- `titleDraft: string`

并向 `CardSurface` 传入：

- `editing`
- `showEditAction`
- `titleDraft`
- `onTitleDraftChange`
- `onEnterEdit`
- `onCommitTitle`
- `onCancelEdit`
- `onOpenEmptyProperty`

其中：

- `showEditAction = hovered && !editing && !active`
- overlay 不传编辑能力

### `CardSurface.tsx`

`CardSurface` 改成“表面视图组件”，输入应包含：

- 当前 record/title/property 数据
- editing 状态
- 标题相关回调
- 空属性入口回调

内部结构建议：

1. 右上角 action 区

- view mode 下 hover 才显示
- 一个 edit icon button
- 点击后：
  - `preventDefault`
  - `stopPropagation`
  - 进入 edit mode

2. title 区

- view mode：
  - `<div>` 显示 title
  - 空 title 时显示 placeholder
- edit mode：
  - `<Input>` 组件
  - 自动聚焦并选中

3. properties 区

- view mode：
  - 通过 `CardPropertySlot` 只渲染有值属性
- edit mode：
  - 通过 `CardPropertySlot` 统一处理
  - 非空属性继续使用 `CardField`
  - 空值属性渲染 `AddCardPropertyTrigger`
  - 点击后打开对应 property 的 `valueEditor`

## 交互方案

### title 编辑交互

进入编辑：

- 点击右上角 edit icon

编辑中行为：

- `Enter` 提交
- `Escape` 回滚到进入编辑前的值并退出
- `blur` 提交并退出

提交方式：

- 直接调用 `engine.records.setValue(record.id, titleProperty.id, nextValue)`
- 如果 title 被清空：
  - 这里建议仍然写入空字符串，而不是 `clearValue`
  - 原因是 title 语义通常比普通字段更偏“允许空文本”，不是“删除值”

如果后续确认 title 必须与普通 text field 完全一致，再改成：

- 空字符串转 `clearValue`

### 编辑态下的卡片外层行为

当 `editing === true` 时，`Card.tsx` 需要收敛外层行为：

- 不触发 drag start
- 点击 input 或 edit controls 时不触发 selection
- 可允许点击卡片外部时失焦提交

做法上不需要大改现有拖拽结构：

- 继续利用 `shouldCapturePointer(...)`
- 同时在 `Card.tsx` 中额外短路：
  - `if (editing) return`

### 空属性入口交互

空属性入口点击后：

- 不进入 title edit
- 不触发卡片 selection
- 直接打开当前 property 对应的 `valueEditor`

前提：

- 只有 `editing === true` 时才渲染这些入口

这部分不要重新造 inline property editor。

建议把现有 `CardField` 里的 `openField(...)` 提炼成共享 helper，例如：

- `dataview/src/react/views/shared/openCardField.ts`

由以下地方共同使用：

- `CardField`
- `AddCardPropertyTrigger`

## 具体改造顺序

### 第一阶段：title 从 `CardField` 中剥离

1. 修改 [dataview/src/react/views/gallery/components/CardSurface.tsx](/Users/realrong/Rostack/dataview/src/react/views/gallery/components/CardSurface.tsx)

- title 改成本地 `div`
- 不再使用 title 的 `CardField`

2. `CardField` 继续只服务普通属性

### 第二阶段：加入 edit mode

1. 修改 [dataview/src/react/views/gallery/components/Card.tsx](/Users/realrong/Rostack/dataview/src/react/views/gallery/components/Card.tsx)

- 增加 hover / editing / titleDraft 状态

2. 修改 `CardSurface`

- 增加右上角 edit icon
- editing 时 title 渲染 `Input`

### 第三阶段：空值属性入口

1. 在 `CardSurface` 中判断属性值是否为空

- view mode：
  - 通过 `CardPropertySlot` 非空才渲染
  - 空值直接隐藏
- edit mode：
  - 通过 `CardPropertySlot` 统一渲染
  - 空值渲染“添加 xxx”

2. 新增共享槽位组件与 trigger 组件

- `CardPropertySlot`
- `AddCardPropertyTrigger`
- `openCardField.ts`

### 第四阶段：overlay 对齐

overlay 里的 `CardSurface` 不进入编辑态：

- 不显示 edit icon
- 不显示 input
- 空值属性也不显示
- 只显示普通只读 title + 非空属性

即：

- `editing={false}`
- `showEditAction={false}`

## 不建议这次一起做的事

以下内容不建议与本次改造绑定：

1. 不同步改 kanban

- gallery 的交互目标更接近 Notion 卡片
- kanban 仍然适合更紧凑的属性展示

2. 不把普通属性也全部改成 inline editor

- 当前 `valueEditor` 已经可用
- 这次只需要把空值属性从“浏览态的 `—`”改成“编辑态下的添加入口”

3. 不给 `CardField` 增加 `isEditing`

- 这会把 card-level 的显示策略污染进 field-level 组件
- 未来 gallery / kanban 的差异会更难收敛

3. 不把 `Card.tsx` 与 `CardSurface.tsx` 合并

- hover / selection / drag / edit mode 控制仍应留在交互壳

## 风险点

1. 编辑态与拖拽态冲突

- 必须确保 edit button 和 title input 不会触发 drag

2. blur 提交与卡片 click 冲突

- 点击卡片其它位置时，可能同时触发：
  - input blur
  - card selection
- 需要在事件顺序上仔细处理

3. title 提交语义

- 空字符串是写回空文本，还是清值
- 需要在实现前确认一次

4. 空属性入口的 anchor 获取

- 若要复用现有 `valueEditor`，需要稳定的 anchor 元素
- 最简单方案是让“添加 xxx”按钮本身作为 anchor

## 最终建议

推荐按下面的边界实现：

- `Card.tsx`
  - 管 hover / edit state / outer interaction
- `CardSurface.tsx`
  - 管 title / property 的 view 与 edit UI
- `CardField`
  - 仅服务普通属性
- `CardPropertySlot`
  - 管属性槽位在 view/edit 模式下的显示策略
- `AddCardPropertyTrigger`
  - 管空值属性的“添加 xxx”入口
- 新增共享 helper
  - 专门负责从一个 DOM element 打开某个 field 的 `valueEditor`

这条路线比“继续把 title 塞进 CardField”或“给 CardField 增加 isEditing”都更干净，也能为后续 kanban 是否跟进保留独立空间。
