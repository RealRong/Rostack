# DataView RecordCard 最终重构方案

## 目标

这份文档只解决一件事：

- [`dataview/packages/dataview-react/src/views/shared/RecordCard.tsx`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/RecordCard.tsx)

应该如何从“半容器组件”收敛成“纯 card primitive”。

目标是一次性定清最终边界：

- 减少组件内部状态拼装
- 减少 props 数量
- 消除重复派生
- 统一 card 状态来源
- 为 gallery / kanban / 后续 card-like view 提供稳定复用面
- 不做兼容层

## 当前问题

`RecordCard` 现在不是一个纯展示组件，而是同时承担了几类职责：

- 通过 `itemId` 反查 `recordId`
- 从 records store 再读取 `record`
- 读取 committed selection
- 读取 marquee preview selection
- 读取 inline editing
- 计算 `selected`
- 计算 `draggingActive` / `draggingSelected`
- 计算 `hasVisibleFields`
- 处理 pointer down / click / select / drag
- 计算 presentation
- 计算 surface style

这会带来几个明确问题。

### 1. shared primitive 直接读取 runtime store

这使得 `RecordCard` 不是 pure render component，而是一个叶子层容器组件。

后果是：

- 状态来源分散
- 组件职责不清
- 后续复用必须隐式依赖整个 dataview runtime

### 2. runtime model 与组件内派生重复

`gallery.card` / `kanban.card` 已经提供：

- `selected`
- `editing`
- `fields`
- `size`
- `layout`
- `wrap`
- `canDrag`

但 `RecordCard` 里又重新读取 selection / inline state，再现场拼一次。

这会导致：

- 单一事实来源被破坏
- 相同语义跨层重复派生
- 后续优化引用稳定性时更难收敛

### 3. 展示派生重复

`RecordCard` 里先算 `hasVisibleFields`，而 [`CardContent.tsx`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/CardContent.tsx) 里又再算 `visibleFields`。

本质上是同一条展示语义被拆成两段重复推导。

### 4. props 面过宽且语义扁平

当前 props 是这种模式：

- `viewId`
- `itemId`
- `fields`
- `size`
- `layout`
- `wrap`
- `canDrag`
- `drag`
- `selection`
- `titlePlaceholder`
- `showEditAction`
- `presentationSelected`
- `measureRef`
- `className`
- `style`
- `selectedStyle`
- `resolveSurfaceStyle`

问题不是数量本身，而是这些参数实际上属于不同语义层，却被平铺在一个组件上。

## 最终结论

一句话结论：

**`RecordCard` 不应再自己读取 dataview runtime/store；它必须只消费已经准备好的 card 数据、record 数据、交互行为和外观配置。**

也就是说，最终边界应改成：

- `dataview-runtime` 负责产出共享 card state
- view adapter 负责读取 runtime model 并注入 view-specific appearance
- `RecordCard` 只负责渲染和 DOM 交互

## 最终分层

## `dataview-runtime`

负责：

- 共享 card headless state
- view-specific card headless state
- `selected` / `editing` / `recordId` 这类 card 展示基础状态

不负责：

- hover
- drag pointer session
- DOM event
- measure ref
- surface style

## view adapter

这里的 adapter 指：

- [`dataview/packages/dataview-react/src/views/gallery/components/Card.tsx`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/gallery/components/Card.tsx)
- [`dataview/packages/dataview-react/src/views/kanban/components/Card.tsx`](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/kanban/components/Card.tsx)

负责：

- 读取 `runtime.card`
- 读取 `record`
- 注入 `interaction`
- 注入 `appearance`
- 保留少量 view-specific 差异

不负责：

- 重新推导 shared card state
- 重新读取 selection / inline 组成 card 基础状态

## `RecordCard`

负责：

- card shell 渲染
- hover 本地态
- DOM click / pointer down
- 调用外部传入的交互行为
- 根据已给定数据计算 presentation

不负责：

- 自己找 `record`
- 自己找 `recordId`
- 自己找 `selected`
- 自己找 `editing`
- 自己找 `fields / layout / wrap / canDrag`

## 最终数据模型

应该先在 runtime 层抽出共享基础 card 数据。

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

这个类型的语义非常明确：

- 它是所有 card-like view 的公共最小展示输入
- 它不包含 DOM
- 它不包含 appearance
- 它不包含 drag session 运行时对象

在此基础上，各 view 再附加自己的差异数据。

### Gallery

```ts
interface GalleryCardData extends RecordCardData {}
```

### Kanban

```ts
interface KanbanCardData extends RecordCardData {
  color?: string
}
```

以后如果还有其他 card-like view，也应该在这个共享基型上做扩展，而不是再让 shared React 组件自己拼状态。

## 最终组件 API

`RecordCard` 不应继续接收一大串扁平 props。

最终 API 应收敛成 4 个语义对象。

```ts
interface RecordCardInteraction {
  drag: {
    activeId: ItemId | undefined
    dragIdSet: ReadonlySet<ItemId>
    shouldIgnoreClick(): boolean
    onPointerDown(id: ItemId, event: ReactPointerEvent<HTMLElement>): void
  }
  selection: {
    select(id: ItemId, mode?: 'replace' | 'toggle'): void
  }
}

interface RecordCardAppearance {
  titlePlaceholder: string | ((record: DataRecord) => string)
  showEditAction?: boolean
  selectedStyle?: CSSProperties
  resolveSurfaceStyle?(input: {
    hovered: boolean
    editing: boolean
    selected: boolean
    record: DataRecord
  }): CSSProperties | undefined
}

interface RecordCardMount {
  measureRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
}

interface RecordCardProps {
  card: RecordCardData
  record: DataRecord
  interaction: RecordCardInteraction
  appearance: RecordCardAppearance
  mount?: RecordCardMount
}
```

这个 API 有几个关键优点：

- `card` 统一承载所有共享 card 状态
- `record` 由外部 adapter 提前解析
- `interaction` 独立为行为域
- `appearance` 独立为 view-specific 外观域
- `mount` 独立为 DOM 装配域

这比当前平铺式 props 更稳定，也更容易做长期扩展。

## 明确删除的概念

以下概念应直接删除，而不是继续保留。

### `presentationSelected`

这个参数语义别扭，本质是在表达：

- presentation 是否跟随 selected

长期最优方案是不再提供这个开关。

`presentation` 应直接基于 `card.selected` 计算；如果某个 view 不希望 selected 改变背景，也应该通过 `appearance.resolveSurfaceStyle` 决定，而不是保留一个 shared primitive 的语义开关。

### 在 `RecordCard` 内部读取 runtime/store

以下读取都应从 `RecordCard` 中移除：

- `useDataView()`
- `useDataViewKeyedValue(...)`
- `useKeyedStoreValue(dataView.selection.store.membership, ...)`
- `useKeyedStoreValue(dataView.session.marquee.preview.membership, ...)`
- `useCardEditingState(...)`

这些读取都不应该出现在 primitive 组件里。

## `CardContent` 的边界

`CardContent` 当前还承担了 title editing 的装配：

- 调用 `useCardTitleEditing`
- 根据 editing 决定 field 显示
- 渲染 title / property list

这不是本轮必须先做的拆分，但长期应继续收敛。

最终推荐方向是：

- `RecordCard` 负责 shell
- `CardContent` 负责纯内容展示
- title editing 的 headless 部分继续通过 hook 或 runtime 提供

但是第一阶段不要求把 `CardContent` 也彻底纯化，否则改动面会过大。

第一阶段只要求：

- `RecordCard` 退出 runtime store 读取
- `RecordCard` 改成纯消费 `card + record + interaction + appearance`

## Gallery / Kanban 最终调用方式

### Gallery

`gallery/components/Card.tsx` 最终应做的事只有：

- 从 `runtime.card` 取 `card`
- 通过 `card.recordId` 取 `record`
- 传入 gallery 的 `interaction`
- 传入 gallery 的 `appearance`

也就是说，gallery adapter 负责的是“view-specific 注入”，而不是“重复推导 shared state”。

### Kanban

`kanban/components/Card.tsx` 也应一致：

- 从 `runtime.card` 取 `card`
- 通过 `card.recordId` 取 `record`
- 使用 `board.fillColumnColor` 和 `card.color` 组成 `appearance.resolveSurfaceStyle`
- 其余 shared state 不再本地推导

## 迁移顺序

建议严格按下面顺序实施。

### 第一步

在 `dataview-runtime` 中抽出共享 `RecordCardData`。

要求：

- gallery / kanban card model 都复用它
- 补上 `recordId`
- 保留 `selected` / `editing`

### 第二步

改造 `RecordCard` 的 props。

要求：

- 从扁平 props 改成 `card + record + interaction + appearance + mount`
- 删除内部 runtime 读取
- 删除 `presentationSelected`

### 第三步

改造 gallery / kanban adapter。

要求：

- adapter 显式读取 `record`
- adapter 显式传入 `interaction`
- adapter 显式传入 `appearance`

### 第四步

清理旧概念和重复逻辑。

要求：

- 删掉 `RecordCard` 内部旧读取
- 删掉旧 props 兼容
- 清理不再需要的 helper

## 实施后的收益

实施完成后，会得到几个直接收益。

### 1. shared primitive 真正纯化

`RecordCard` 不再绑定 dataview runtime 细节，复用边界更清晰。

### 2. card 状态单一来源

`selected` / `editing` / `recordId` 不再跨层重复计算。

### 3. props 更短且语义更强

不再是一串离散布尔和字段，而是稳定的语义对象。

### 4. React rerender 分析更容易

以后看性能时，可以明确区分：

- `card` 变了
- `record` 变了
- `interaction` 变了
- `appearance` 变了

而不是在 `RecordCard` 里继续隐式订阅多份 store。

### 5. 为后续 card-like view 复用打基础

以后要支持更多卡片视图，不需要再复制一份“半 shared 半容器”的组件模式。

## 最终原则

最后把原则压缩成一句话：

**shared React primitive 只能消费数据，不应该自己发起 dataview 业务状态读取。**

对于 `RecordCard` 来说，这条规则应被视为长期固定约束。
