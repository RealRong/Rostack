# Dataview Drag Overlay Clone Host Architecture

## 文档目标

这份文档定义 dataview drag overlay 的最终收敛方案。

目标只有三个：

- overlay 上收到 page-level host
- 所有 view 统一走 DOM clone
- 模型尽量简单，不保留 render preview 分支

## 最终结论

### 1. overlay 是 page 级能力

drag overlay 应和 marquee、keyboard、inline session 一样，放到 `dataview/packages/dataview-react/src/page/hosts`。

最终新增：

- `dataview/packages/dataview-react/src/page/hosts/DragHost.tsx`

最终接入：

- `dataview/packages/dataview-react/src/page/Page.tsx`

也就是：

- view 负责提供拖拽状态和源节点
- `DragHost` 负责 portal、clone、跟手移动、badge、stack 外壳

### 2. 不保留 render 模式

gallery / kanban / table 全部统一为：

- 从真实 DOM 节点 clone overlay
- 不再单独渲染 `CardPreview`
- 不再保留 `clone` / `render` 双模型

这条规则要写死，避免后续再次分叉。

### 3. 瞬时态通过 clone scrub 清理

如果 clone 带上了 hover、edit action、局部按钮、临时 chrome，不通过 render 重做，而是在 clone 后统一清理。

清理方式：

- 默认清理 `[data-drag-clone-hidden]`
- 允许附加 `scrubSelectors`
- 统一在 clone utility 内通过 `querySelectorAll(...)` 执行

这样模型仍然只有一条主路径。

## 最终结构

### page 层

- `Page.tsx` 挂载 `DragHost`
- host 订阅 `dataView.page.drag`
- host 只做渲染，不理解 table / gallery / kanban 语义

### view 层

- table / gallery / kanban 各自继续保留自己的拖拽命中、排序、drop 语义
- 每个 view 只需要在拖拽激活时提供一份统一的 `DragSpec`
- `source` 永远指向当前被拖拽项的真实 DOM 节点

### clone 层

- clone 工具统一负责复制节点
- 统一负责宽高锁定、透明度、禁用 pointer events、删除临时子节点
- 不允许 view 自己再写一份 portal overlay 组件

## 最终 API

```ts
type DragKind = 'row' | 'card'

interface DragSpec {
  active: boolean
  kind: DragKind
  source: HTMLElement | null
  pointerRef: MutableRefObject<PointerPosition | null>
  offsetRef: MutableRefObject<PointerPosition>
  size: {
    width: number
    height: number
  }
  extraCount: number
  scrubSelectors?: readonly string[]
}

interface DragApi {
  get(): DragSpec | null
  set(next: DragSpec | null): void
  clear(): void
}

function cloneDragNode(
  source: HTMLElement | null,
  input?: {
    size?: {
      width: number
      height: number
    }
    scrubSelectors?: readonly string[]
  }
): HTMLElement | null
```

说明：

- `kind` 只控制外层装饰，不控制内容生成
- `source` 是唯一内容来源
- `extraCount` 统一表达多选拖拽数量
- `scrubSelectors` 只是补充口，不是第二套渲染模型

## Host 行为

`DragHost` 的职责固定为：

- 从 `source` clone 节点
- 应用 `size`
- 清理 `[data-drag-clone-hidden]` 和 `scrubSelectors`
- 用 `pointerRef + offsetRef` 做 fixed 跟手移动
- `kind === 'card' && extraCount > 0` 时绘制 stacked 底板
- `extraCount > 0` 时绘制 badge

host 不做这些事：

- 不读取 record
- 不渲染 `CardPreview`
- 不处理 drop target
- 不处理 reorder 语义

## 命名设计

保留和新增的最终命名如下：

- host: `DragHost`
- page api: `dataView.page.drag`
- spec: `DragSpec`
- kind: `DragKind`
- util: `cloneDragNode`
- DOM 标记: `data-drag-clone-hidden`

不再推荐继续保留的命名：

- `dragGhost`
- view 内部单独的 `Overlay.tsx`
- `render overlay`
- `card preview overlay`

## 各 view 的接入方式

### table

- `source` 来自当前 row DOM
- `kind = 'row'`
- 一般不需要额外 `scrubSelectors`

### gallery

- `source` 来自当前 card DOM
- `kind = 'card'`
- 将 edit action、hover-only chrome 标记为 `data-drag-clone-hidden`

### kanban

- `source` 来自当前 card DOM
- `kind = 'card'`
- 和 gallery 使用同一套 clone 规则

## 删除项

这轮方案落地后应删除：

- `dataview/packages/dataview-react/src/views/gallery/components/Overlay.tsx`
- `dataview/packages/dataview-react/src/views/kanban/components/Overlay.tsx`

`dataview/packages/dataview-react/src/dom/dragGhost.tsx` 不应再作为 table 私有方案继续存在。

它要么直接被 `DragHost` 取代，要么重命名并提升为通用 clone utility / host 实现的一部分，但不能继续维持“table 一套、card 两套”的结构。

## 最终原则

- 只有一个 host
- 只有一种内容来源：真实 DOM clone
- 只有一种清理方式：clone 后 query selector scrub
- view 负责拖拽语义
- page 负责 overlay 渲染
