# DataView RecordCard / CardContent / EditableCardTitle 最终重构方案

## 目标

这份文档只解决一件事：

- [`dataview/packages/dataview-react/src/views/shared/RecordCard.tsx`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/RecordCard.tsx)
- [`dataview/packages/dataview-react/src/views/shared/CardContent.tsx`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/CardContent.tsx)
- [`dataview/packages/dataview-react/src/views/shared/useCardTitleEditing.ts`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/useCardTitleEditing.ts)
- [`dataview/packages/dataview-react/src/views/shared/CardTitle.tsx`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/CardTitle.tsx)

这条链的最终职责边界应该如何收敛。

目标是一次性明确：

- 哪些逻辑还不该留在 `RecordCard`
- 哪些内容投影应该继续下沉到 `dataview-runtime`
- `CardContent` 应该保留到什么程度
- `useCardTitleEditing` 和 `CardTitle` 是否应该合并
- 最终组件 API 如何尽量短、尽量稳、尽量清晰

不考虑兼容成本。

## 当前问题

虽然上一阶段已经把 `RecordCard` 从直接读取 runtime/store 收成了纯消费组件，但当前边界仍然不够干净。

### `RecordCard` 仍然承担内容投影

`RecordCard` 当前仍然知道：

- `record`
- `record.values`
- `visibleFields`
- `titlePlaceholder` 的动态解析
- `resolveCardPresentation(...)` 需要的 `hasVisibleFields`

这说明它还不是纯 card shell，而是仍然在做一部分 content projection。

### `CardContent` 仍然承担 title 编辑装配

[`CardContent.tsx`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/CardContent.tsx) 现在同时负责：

- 内容布局
- 标题编辑逻辑装配
- property list 渲染
- `fieldRef` 组装

这导致它既不是纯布局组件，也不是纯 title editor host。

### title 编辑链被拆散

当前 title 编辑链横跨两层：

- [`useCardTitleEditing.ts`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/useCardTitleEditing.ts)
- [`CardTitle.tsx`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/CardTitle.tsx)

但实际复用面只有一个调用点：

- [`CardContent.tsx`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/CardContent.tsx)

也就是说，这种“hook + pure view”拆法在当前代码库里没有带来真实复用收益，反而让链路更散。

## 最终结论

一句话结论：

**`RecordCard` 应进一步退化为 card shell；card 内容投影继续下沉到 runtime；`CardContent` 只保留内容布局；`useCardTitleEditing` 与 `CardTitle` 合并为单个 `EditableCardTitle` 组件。**

## 最终分层

## `dataview-runtime`

负责：

- card 的 headless 基础状态
- card 的内容投影
- title 文本 / placeholder 文本 / property 列表
- `selected` / `editing` / `recordId`

不负责：

- pointer 交互
- DOM hover
- ref / focus
- input 渲染
- drag host

## `RecordCard`

负责：

- card shell
- pointer down / click
- drag active / drag selection 视觉态
- hover / selected / dragging 的外层视觉壳
- 内容布局容器挂载

不负责：

- 解析 title placeholder
- 计算 visible fields
- 从 `record.values` 推导 property list
- 直接理解 record 内容结构

## `CardContent`

负责：

- 纯内容布局
- 标题区、属性区、edit action 的排版

不负责：

- 读取 editing session
- 管理 title draft
- 计算 property 可见性
- 构建 field/value 映射

## `EditableCardTitle`

负责：

- 读取 inline editing membership
- 管理 draft
- `enterEdit / commit / submit / exit`
- input focus
- view/edit 两态标题渲染

它应该成为 title 编辑的一体化组件，不再拆成 hook + pure text/input view。

## 继续下沉到 Runtime 的内容

当前 runtime 只有共享的 `RecordCardData`，还不够。

下一阶段应新增共享 card content model。

建议分成两层。

### 第一层：共享 card shell 数据

保留现有思路：

```ts
interface RecordCardData {
  viewId: ViewId
  itemId: ItemId
  recordId: RecordId
  fields: readonly CustomField[]
  size: CardSize
  layout: CardLayout
  wrap: boolean
  canDrag: boolean
  selected: boolean
  editing: boolean
}
```

这层表达的是：

- 卡片壳需要的基础状态

### 第二层：共享 card 内容投影

新增：

```ts
interface RecordCardPropertyData {
  fieldId: FieldId
  field: CustomField
  value: unknown
}

interface RecordCardContentData {
  titleText: string
  placeholderText: string
  properties: readonly RecordCardPropertyData[]
  hasProperties: boolean
}
```

这层表达的是：

- 卡片内容区需要的已投影数据

一旦有了这层，React 侧就不再需要：

- `record.values[field.id]`
- `visibleFields.filter(...)`
- `titlePlaceholder(record)`

这些都属于纯数据派生，应由 runtime 一次性产出。

## 为什么 `visibleFields` 应该进入 Runtime

`visibleFields` 的计算满足这几个条件：

- 输入是 `record.values + fields + editing`
- 输出是纯数据
- 不依赖 React
- 不依赖 DOM
- 不依赖 ref

因此它天然属于 `dataview-runtime`，不该长期留在 [`RecordCard.tsx`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/RecordCard.tsx)。

同理：

- `hasVisibleFields`
- `placeholderText`
- `titleText`

都应该跟随 card content projection 一起下沉。

## `RecordCard` 当前仍然不需要的部分

长期看，以下内容都不该继续留在 [`RecordCard.tsx`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/RecordCard.tsx)：

- `record: DataRecord`
- `visibleFields` 计算
- `resolveTitlePlaceholder(...)`
- `resolveCardPresentation(...)` 的内容驱动输入
- `resolveSurface` 里对 `record` 的依赖

这里最核心的是：

**shared primitive 不该再消费完整的 record。**

因为一旦传入完整 `record`，就意味着：

- appearance 层可以继续回头依赖 domain data
- shell 层会继续知道内容结构
- 后续很难稳定收敛到 view model

长期最优是：

- `RecordCard` 不再接收 `record`
- `appearance` 也不再接收 `record`
- 它们都只接收已经解析好的内容 model

## `RecordCard` 中应该保留的部分

以下内容应明确保留在 React 侧，而且留在 `RecordCard` 是合理的：

- `shouldCapturePointer(...)`
- `onPointerDown`
- `onClick`
- `meta/ctrl => toggle` 这类 pointer 交互语义
- drag active / drag selected 的视觉映射
- `measureRef`
- `className`
- `style`
- hover class

原因是这些都与：

- DOM
- PointerEvent
- React render tree
- 交互 host

直接相关，不适合进入 runtime。

这里有一个细节：

`meta/ctrl => toggle` 不一定要留在 `RecordCard` 里，但至少它不该进入 runtime。

如果后续还想继续精简 `RecordCard`，可以把“点击语义”再往 adapter 收一层，但不需要下沉到 runtime。

## `CardContent` 最终职责

[`CardContent.tsx`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/CardContent.tsx) 最终应当只做内容布局。

建议它的最终输入只包含：

```ts
interface CardContentProps {
  title: ReactNode
  properties: readonly ReactNode[]
  showEditAction?: boolean
  onEditAction?: () => void
  propertyDensity?: 'default' | 'compact'
  wrap?: boolean
  slots?: ...
}
```

也就是说：

- `CardContent` 不应该知道 `viewId`
- `CardContent` 不应该知道 `itemId`
- `CardContent` 不应该知道 `record`
- `CardContent` 不应该知道 `fieldRef`
- `CardContent` 不应该知道 `editing session`

这些都应由更上层准备好后再交给它。

换句话说：

**`CardContent` 最终应该是纯 layout component，而不是半个 headless renderer。**

## `useCardTitleEditing` 与 `CardTitle` 是否应该合并

结论是：

**应该合并。**

原因很明确。

### 1. 当前没有真实复用收益

当前搜索结果说明：

- `useCardTitleEditing(...)` 只在一个地方用
- `CardTitle` 也只在一个地方用

既然只有一个调用点，拆成两个文件不会带来复用价值。

### 2. 行为链天然是一体的

title 编辑本质上是一条封闭链：

- 读 editing state
- 维护 draft
- focus input
- blur commit
- enter submit
- exit effect 处理

这条链拆成 hook + view，并不会让边界更清晰，反而让读代码的人要来回跳文件。

### 3. 合并后更利于 `CardContent` 纯化

如果有一个：

```ts
<EditableCardTitle ... />
```

那么 `CardContent` 就只需要把这个 node 摆进去，不需要参与 title 编辑装配。

这比现在在 `CardContent` 里：

- 调 hook
- 传一堆 `editing/draft/onDraftChange/onCommit/onSubmit`

明显更简洁。

## 最终建议组件

建议把：

- [`useCardTitleEditing.ts`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/useCardTitleEditing.ts)
- [`CardTitle.tsx`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/CardTitle.tsx)

合并成：

- `EditableCardTitle.tsx`

其内部直接完成：

- `useCardEditingState`
- title draft 状态
- exit effect
- input focus
- text/input 渲染

## `EditableCardTitle` 最终 API

建议 API 保持最小：

```ts
interface EditableCardTitleProps {
  viewId: ViewId
  itemId: ItemId
  recordId: RecordId
  titleText: string
  placeholderText: string
  wrap?: boolean
  rootClassName?: string
  textClassName?: string
  inputClassName?: string
}
```

这个 API 有几个关键点：

- 不接完整 `record`
- 不接 `draft`
- 不接 `editing`
- 不暴露 `onDraftChange / onCommit / onSubmit`

因为它本来就应该是自带行为的一体化组件。

它的输入应该只包含：

- 识别目标 card title 所需的 id
- 已投影好的 title 文本
- 已投影好的 placeholder 文本
- 少量样式参数

## 最终组件树

长期最优结构建议收成下面这样：

```tsx
<RecordCardShell ...>
  <CardContent
    title={
      <EditableCardTitle
        viewId={...}
        itemId={...}
        recordId={...}
        titleText={...}
        placeholderText={...}
        wrap={...}
      />
    }
    properties={projectedProperties.map(property => (
      <CardPropertyValue ... />
    ))}
    showEditAction={...}
    onEditAction={...}
  />
</RecordCardShell>
```

这里的边界是最干净的：

- shell 只管壳
- content 只管布局
- editable title 只管标题编辑
- runtime 提供内容投影

## 不建议的方向

以下方向不建议采用。

### 1. 把 `CardContent`、`CardTitle`、`useCardTitleEditing` 全并成一个大组件

这会得到一个更大的“全能组件”，不是更清晰的分层。

### 2. 继续保留 `RecordCard -> CardContent -> hook + CardTitle` 这种链路

这条链的拆分粒度不对，已经证明没有实际复用收益。

### 3. 让 `RecordCard` 长期继续消费完整 `record`

这会让 shared primitive 一直无法真正纯化。

## 分阶段实施顺序

建议按下面顺序做。

### 第一步

在 `dataview-runtime` 中新增共享 card content projection。

目标：

- `titleText`
- `placeholderText`
- `properties`
- `hasProperties`

### 第二步

让 gallery / kanban 的 card model 同时暴露：

- `card`
- `content`

或者更进一步，直接暴露一份组合后的：

- `cardView`

但名称要简短，不要叫 `xxxVm`。

### 第三步

新增 `EditableCardTitle.tsx`，删除：

- [`useCardTitleEditing.ts`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/useCardTitleEditing.ts)
- [`CardTitle.tsx`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/CardTitle.tsx)

### 第四步

纯化 [`CardContent.tsx`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/CardContent.tsx)，让它只保留 layout。

### 第五步

最后再纯化 [`RecordCard.tsx`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/RecordCard.tsx)，把：

- `record`
- `visibleFields`
- placeholder 解析

全部移出。

## 最终原则

最后把原则压缩成三句话：

**`RecordCard` 只负责 shell，不负责内容投影。**

**`CardContent` 只负责布局，不负责 title 编辑状态管理。**

**title 编辑链只保留一个组件，不再拆成 hook + view。**
