# DataView Store 下沉与分层最终方案

## 目标

这份文档只解决一件事：

- `dataview/packages/dataview-react`
- `dataview/packages/dataview-runtime`

之间，所有 **store / 视图数据 / React 装配 / DOM bridge** 的最终边界应该如何划分。

目标不是做局部修补，而是作为下一阶段的一次性实施依据：

- 全部优化
- 不留遗漏
- 不做兼容层
- 不保留旧 re-export
- 不保留 React 侧的旧业务 store 装配方式

## 核心结论

一句话结论：

**凡是“纯状态派生的视图数据 store”都必须下沉到 `dataview-runtime`；凡是“依赖 React 生命周期、容器尺寸、DOM 几何、pointer/drag/marquee bridge”的都必须留在 `dataview-react`。**

因此问题不应被理解为：

- `createKeyedDerivedStore(...)` 该不该存在

而应理解为：

- `createKeyedDerivedStore(...)` 该出现在哪一层

正确答案是：

- 它应该大量出现在 `dataview-runtime`
- 它不应该继续出现在 React hook 文件里承担业务视图模型装配

## 最终边界判断原则

判断是否应该进入 `dataview-runtime`，只看一个标准：

**这个能力在没有 React、没有 DOM、没有 HTMLElement、没有 ref、没有 effect 的前提下是否仍然成立。**

如果成立，就必须进入 `dataview-runtime`。

如果不成立，就必须留在 `dataview-react`。

这条规则可以直接固化成工程约束。

## 明确禁止的模式

下一阶段实施后，以下模式应在 `dataview-react` 中禁止：

1. React hook 里创建 headless 业务 store
2. `createValueStore(...) + useEffect(...store.set(...))` 用来同步业务视图数据
3. 组件在 render 中从多个 raw store 现场拼业务展示态
4. 叶子组件对同一个宽 store 各自写 selector 做布尔判断
5. React view runtime 文件同时承担：
   - 视图模型创建
   - 虚拟化
   - 几何缓存
   - marquee scene
   - drag bridge
6. 为了兼容旧接口保留双轨输出

## 哪些东西必须进入 `dataview-runtime`

这些东西都属于 headless 视图模型，应统一进入 `dataview-runtime`：

- `page` 的 toolbar / queryBar / settings / header / body
- `table` 的 body / row / header / footer / section
- `gallery` 的 bodyBase / section / card
- `kanban` 的 boardBase / section / card
- `inline` 的 keyed editing membership
- `selection` 的 keyed membership / scope summary
- `marquee preview` 的 keyed membership
- `value editor` 的已解析展示数据
- `create record` 的 headless 初始值推导结果

这些东西的共同点是：

- 输入是 engine state / session state / runtime state
- 输出是可渲染数据
- 不依赖 DOM

## 哪些东西必须留在 `dataview-react`

这些东西必须留在 `dataview-react`：

- `containerRef`
- `canvasRef`
- `scrollRef`
- 虚拟化与 layout hook
- DOM 几何缓存
- `MarqueeScene`
- `shouldStartMarquee(event)`
- autopan driver
- drag overlay bridge
- pointer 监听与 pointer drag session
- 所有 overlay / portal / popup / focus trap 宿主

这些东西的共同点是：

- 依赖 React 生命周期
- 依赖 DOM
- 依赖容器和测量
- 是宿主桥接能力，而不是业务视图模型

## 最终包分层

下一阶段的最终包边界应当是：

### `dataview-runtime`

负责：

- headless session
- headless intent / command
- headless view model
- headless display projection

不负责：

- DOM
- ref
- 虚拟滚动宿主
- overlay bridge
- drag overlay
- page event host

### `dataview-react`

负责：

- 读取 `dataview-runtime` 暴露的 headless store
- 把 headless model 装配进 React/DOM 环境
- 接虚拟化、拖拽、marquee scene、autopan、overlay

不负责：

- 创建 headless 业务视图 store
- 重新解释 engine/query/session 生成业务展示态

## 最终顶层 API

长期最终结构应统一成下面这种形式。

```ts
interface DataViewRuntime {
  engine: Engine
  read: DataViewReadApi
  write: DataViewWriteApi

  session: DataViewSessionApi
  intent: DataViewIntentApi

  model: {
    page: PageModel
    inline: InlineModel
    table: TableModel | null
    gallery: GalleryModel | null
    kanban: KanbanModel | null
  }

  dispose(): void
}
```

这里的 `model` 含义非常明确：

- 都是 headless
- 都是 view data
- 都可以直接给 React 渲染消费

React 层最终只是在这个基础上再包一层 bridge：

```ts
interface DataViewReactSession extends DataViewRuntime {
  react: {
    drag: DragApi
    marquee: MarqueeBridgeApi
  }
}
```

## 模块布局

建议下一阶段直接调整成下面这种模块布局。

### `dataview-runtime`

```ts
src/
  model/
    page/
      types.ts
      api.ts
    table/
      types.ts
      api.ts
    gallery/
      types.ts
      api.ts
    kanban/
      types.ts
      api.ts
    inline/
      types.ts
      api.ts
```

原则：

- `api.ts` 里只做纯 store 装配
- 不依赖 React
- 不依赖 DOM

### `dataview-react`

```ts
src/
  views/
    table/
      runtime.ts
    gallery/
      runtime.ts
    kanban/
      runtime.ts
```

这些 `runtime.ts` 文件在下一阶段的职责应收缩成：

- React 装配
- layout / virtual
- scene bridge
- drag bridge

它们不再负责业务 model store 创建。

## Page 的最终方案

`page` 是最纯的 headless 视图模型，下一阶段应完全进入 `dataview-runtime`。

最终 API：

```ts
interface PageModel {
  body: ReadStore<PageBody>
  header: ReadStore<PageHeader>
  toolbar: ReadStore<PageToolbar>
  queryBar: ReadStore<PageQueryBar>
  settings: ReadStore<PageSettings>
}
```

当前 React 侧的：

- `dataview/packages/dataview-react/src/dataview/runtimeModel.ts`

应整体迁移到 `dataview-runtime`，React 包不再保留一份平行 page model 装配。

### Page 下一阶段要求

- `PageTitle` 以外的 page 核心组件不得直接读 `document` / `active.config`
- `Toolbar`
- `ViewQueryBar`
- `ViewSettings`
- `KeyboardHost`
- `FieldListPanel`

都应优先读取 `page model`

如果某个 host 仍直接读 raw store，则必须给出明确理由；否则视为未完成迁移。

## Table 的最终方案

`table` 的 headless model 也必须整体迁入 `dataview-runtime`。

最终 API：

```ts
interface TableModel {
  body: ReadStore<TableBody>
  row: KeyedReadStore<ItemId, TableRow>
  header: KeyedReadStore<FieldId, TableHeader>
  footer: KeyedReadStore<string, TableFooter | undefined>
  section: KeyedReadStore<SectionKey, TableSection | undefined>
}
```

### 哪些属于 runtime

- `body`
- `row`
- `header`
- `footer`
- `section`
- `rowRail.exposed`
- 常用 capability projection

### 哪些属于 react

- table virtual runtime
- row/column pointer interaction
- drag reorder host
- column resize host
- marquee hit-test scene
- row geometry 与 scroll reveal bridge

### Table 下一阶段要求

React 侧：

- `Body.tsx` 只读取 `table.body`
- `BlockContent.tsx` 不再订阅 `table.virtual.window` 拼业务块输入
- `Row.tsx` 只读取 `table.row(itemId)`
- `ColumnHeader.tsx` 只读取 `table.header(fieldId)`
- `ColumnFooterBlock.tsx` 只读取 `table.footer(scopeId)`
- `SectionHeader.tsx` 只读取 `table.section(sectionKey)`

并且：

- table controller 最终只保留 React/DOM/interaction 相关能力
- 不能继续兼做 headless model creator

## Gallery 的最终方案

`gallery` 要分成两层：

- headless model
- react layout

不能把当前 `body` 原样整块搬迁，因为里面混有 virtual/layout 结果。

### 最终 API

```ts
interface GalleryModel {
  bodyBase: ReadStore<GalleryBodyBase>
  section: KeyedReadStore<SectionKey, GallerySection | undefined>
  card: KeyedReadStore<ItemId, GalleryCard | undefined>
}
```

```ts
interface GalleryRuntime {
  body: ReadStore<GalleryBody>
  section: GalleryModel['section']
  card: GalleryModel['card']

  containerRef: RefObject<HTMLDivElement | null>
  layout: GalleryLayoutRuntime
  drag: GalleryDragRuntime
}
```

### 必须进入 runtime 的部分

当前 [dataview/packages/dataview-react/src/views/gallery/runtime.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/gallery/runtime.ts) 里，以下必须迁走：

- `section`
- `card`
- `body` 里纯 headless 的字段

也就是：

- `viewId`
- `empty`
- `grouped`
- `groupUsesOptionColors`
- `sectionCountByKey`

### 必须留在 react 的部分

- `containerRef`
- `useGalleryBlocks(...)`
- `cardRectById`
- `marqueeScene`
- `useRegisterMarqueeScene(...)`
- `useCardReorder(...)`
- `dataView.react.drag.set(...)`

### Gallery 下一阶段要求

`gallery/runtime.ts` 最终不允许再出现：

- 业务 `createKeyedDerivedStore(...)`
- 业务 `createValueStore(...) + useEffect(set...)`

它只能消费 `dataView.model.gallery`。

## Kanban 的最终方案

`kanban` 与 `gallery` 完全同一原则。

### 最终 API

```ts
interface KanbanModel {
  boardBase: ReadStore<KanbanBoardBase>
  section: KeyedReadStore<SectionKey, KanbanSection | undefined>
  card: KeyedReadStore<ItemId, KanbanCard | undefined>
}
```

```ts
interface KanbanRuntime {
  board: ReadStore<KanbanBoard>
  section: KanbanModel['section']
  card: KanbanModel['card']

  scrollRef: RefObject<HTMLDivElement | null>
  geometry: KanbanGeometryRuntime
  drag: KanbanDragRuntime
}
```

### 必须进入 runtime 的部分

- `section`
- `card`
- `board` 里 headless 部分

也就是：

- `viewId`
- `grouped`
- `groupField`
- `fillColumnColor`
- `groupUsesOptionColors`

### 必须留在 react 的部分

- `scrollRef`
- 列 body 测量
- card 高度测量
- board geometry
- marquee scene
- drag bridge

### Kanban 下一阶段要求

`kanban/runtime.ts` 与 `gallery/runtime.ts` 一样，不再创建 headless 业务 model store。

## Inline / Selection / Marquee / Value Editor

### Inline

`inline.editing` 已经是正确方向，下一阶段继续保持在 `dataview-runtime`，作为所有 view model 的统一输入。

### Selection

`selection membership` 必须继续保留在 `dataview-runtime`，并作为 view model 的上游输入，而不是让 React leaf 组件自己从 selection store 推导所有显示态。

### Marquee

headless 的：

- session
- preview membership
- commit semantics

都必须在 `dataview-runtime`。

React 侧只保留：

- scene registry
- event host
- overlay
- autopan

### Value Editor

下一阶段应继续收窄：

- `FieldValueEditorHost` 不应在 React 侧直接读取 document 再现场解析 field meta
- runtime 应直接提供已解析 value editor 展示数据

例如：

```ts
interface ValueEditorResolved {
  recordId: RecordId
  fieldId: FieldId
  field: Field
  kind: Field['kind']
}
```

## Create Record

`create record` 的 open/close/session 语义已经在 `dataview-runtime`，下一阶段应继续保持。

但凡是与当前 query / group / filter / 默认值推导相关的初始 record 数据，也应继续收在 runtime。

React 侧未来添加 record 组件时：

- 只负责触发 intent
- 不负责自己推导 `set` 初始值

## `createKeyedDerivedStore(...)` 的最终使用规则

下一阶段可以明确写成工程规则：

### 在 `dataview-runtime` 中

允许并鼓励：

- `createDerivedStore(...)`
- `createKeyedDerivedStore(...)`
- `createProjectedStore(...)`

用于创建：

- headless model
- keyed view data
- capability projection

### 在 `dataview-react` 中

只允许在下面两类场景使用：

1. React/DOM bridge 的局部状态
2. layout / geometry / interaction 的内部 store

不允许用于创建：

- `row/card/section/header/footer` 这类业务展示模型

## `createValueStore(...) + useEffect(set...)` 的最终使用规则

这类模式下一阶段应被严格限制。

### 允许

- DOM 几何缓存
- pointer session
- drag overlay 状态
- 容器测量快照

### 禁止

- page 业务视图数据
- table / gallery / kanban 的业务展示模型
- 所有 `row/card/section/header/footer/bodyBase` 这类 headless 视图数据

如果某个 store 的输入完全来自 runtime/raw store，而不是 DOM，就不应通过 `useEffect(set...)` 同步。

## 最终实现顺序

下一阶段建议一次性按下面顺序实施，不做兼容。

### 第一阶段：把 headless model 全部搬进 `dataview-runtime`

新增：

- `model/page`
- `model/table`
- `model/gallery`
- `model/kanban`
- `model/inline`

完成后：

- `DataViewRuntime.model.page`
- `DataViewRuntime.model.inline`
- `DataViewRuntime.model.table`
- `DataViewRuntime.model.gallery`
- `DataViewRuntime.model.kanban`

全部可用。

### 第二阶段：React 侧改为只消费 runtime model

要求：

- 删除 React 侧 page model 创建
- 删除 view runtime 文件里的业务 `createKeyedDerivedStore(...)`
- 删除 view runtime 文件里的业务 `createValueStore(...) + useEffect(set...)`

### 第三阶段：缩 React runtime 文件职责

每个 view runtime 文件最终只保留：

- layout
- geometry
- drag
- marquee scene
- bridge 输出

### 第四阶段：删除旧实现

必须删除：

- 旧的 React 侧 model creator
- 旧的兼容 re-export
- 旧的 selector 包装壳
- 旧的双轨 runtime 输出

## 不兼容策略

下一阶段明确不做兼容。

直接要求：

- 改顶层类型
- 改 public export
- 改内部调用方
- 删除旧 API

不接受：

- 新旧接口并存
- 旧名字 re-export 到新实现
- 保留旧 shape 只是内部转发

原因很直接：

- 这类兼容层会继续污染边界
- 会让 React 侧继续绕回 raw store
- 会拖长整个重构周期

## 迁移矩阵

下面这张表可以直接作为实施检查表。

### Page

- 迁入 `dataview-runtime`
  - `body`
  - `header`
  - `toolbar`
  - `queryBar`
  - `settings`
- 留在 `dataview-react`
  - page host
  - overlay bridge

### Table

- 迁入 `dataview-runtime`
  - `body`
  - `row`
  - `header`
  - `footer`
  - `section`
  - `rowRail.exposed`
  - 常用 capability projection
- 留在 `dataview-react`
  - virtual runtime
  - resize/reorder pointer host
  - DOM reveal bridge
  - marquee scene

### Gallery

- 迁入 `dataview-runtime`
  - `bodyBase`
  - `section`
  - `card`
- 留在 `dataview-react`
  - virtual layout
  - `containerRef`
  - marquee scene
  - drag bridge
  - overlay bridge

### Kanban

- 迁入 `dataview-runtime`
  - `boardBase`
  - `section`
  - `card`
- 留在 `dataview-react`
  - geometry measurement
  - `scrollRef`
  - marquee scene
  - drag bridge

### Shared

- 迁入 `dataview-runtime`
  - inline editing membership
  - selection membership
  - marquee preview membership
  - value editor resolved data
  - create record initial value derivation
- 留在 `dataview-react`
  - drag overlay state
  - marquee host
  - DOM event listeners

## 完成后的验收标准

下一阶段完成后，必须满足下面全部条件。

1. `dataview-react/src/views/*/runtime.ts` 不再创建业务 `createKeyedDerivedStore(...)`
2. `dataview-react/src/views/*/runtime.ts` 不再用 `createValueStore(...) + useEffect(set...)` 同步业务模型
3. `dataview-react/src/dataview/runtimeModel.ts` 删除
4. `page` 核心展示组件不再直接读 raw `document/active.config`
5. `gallery/kanban` 的 `section/card` store 全部来自 `dataview-runtime`
6. `table` 的 `body/row/header/footer/section` 全部来自 `dataview-runtime`
7. `FieldValueEditorHost` 不再自己读 document 解析展示 meta
8. 不保留旧兼容 export
9. 不保留旧 runtime 双轨装配
10. `createDataViewReactSession(...)` 只做：
   - 创建 headless runtime
   - 创建 react bridge
   - 清理 react bridge

## 一句话最终结论

下一阶段的正确方向不是“把更多 store 塞进 React runtime 文件”，而是：

**把所有 headless view model store 统一收进 `dataview-runtime`，让 `dataview-react` 只剩 React/DOM 装配、虚拟化、几何、marquee scene 与 drag bridge。**

这才是长期最优、复杂度最低、性能也最稳定的最终形态。
