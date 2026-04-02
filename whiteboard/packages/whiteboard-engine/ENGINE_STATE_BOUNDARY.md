# Engine State Boundary

## 目标

明确 whiteboard-engine 的长期边界，保证：

1. engine 只负责 document 语义
2. read 只负责 document 派生读模型
3. UI transient state 不进入 engine
4. viewport 完全留在 React / host

## Engine 真正保存的状态

### 1. Document

`document` 是 engine 唯一的 committed 领域数据源，包含：

- nodes
- edges
- background
- meta

它不再包含 `viewport`。

### 2. History

undo / redo / clear 属于 write 语义，因此继续保留在 engine。

### 3. Runtime Options

少量不属于 document、但会影响读模型计算的 runtime option 继续保留在 engine。

当前保留：

- `mindmapLayout`

## Engine 内部允许存在的派生状态

以下状态允许存在，但只能视为缓存或派生读模型：

- read model
- node / edge / mindmap projection
- node index / snap index
- projection listeners

这些状态都必须能够从：

- `document`
- `mindmapLayout`

重新构建。

## 不应进入 Engine 的状态

以下状态不应由 engine 持有：

- viewport
- selection
- hover
- tool
- gesture preview
- pointer session
- DOM rect
- CSS transform
- css vars
- 任何 React 生命周期状态

这些都应留在 React / host 侧。

## Viewport 边界

### 设计原则

`viewport` 是交互 runtime，不是 document 领域事实，因此不属于 engine。

### 已删除的 engine 侧设计

以下设计已经删除：

- `document.viewport`
- `instance.viewport`
- `instance.read.viewport`
- `commands.viewport`
- `viewport.update` operation
- viewport 进入 history / reduce / read invalidation

### React / Host 的职责

viewport 相关能力全部留在 React / host：

- committed viewport state
- preview viewport state
- `clientToScreen`
- `screenToWorld`
- `worldToScreen`
- `clientToWorld`
- 容器尺寸
- viewport persistence
- viewport initialization

engine 只接收已经完成坐标转换后的 world-space 输入。

## Read 边界

`read` 现在只负责 document 派生能力：

- `read.node`
- `read.edge`
- `read.mindmap`
- `read.index`

它不再暴露：

- viewport
- document 原文档直读口
- runtime option state

## Write 边界

`write` 只负责 document mutation：

- commands
- plan
- core reduce
- history
- read commit

viewport 不再进入 engine write 链路。

## 当前顶层 API

engine 的稳定顶层域现在是：

1. `commands`
2. `read`
3. `configure`
4. `dispose`

其中：

- `commands` 只写 document
- `read` 只读 document 派生结果
- `configure` 只更新 runtime option

这条边界更符合 CQRS，也更符合漏斗原则。
