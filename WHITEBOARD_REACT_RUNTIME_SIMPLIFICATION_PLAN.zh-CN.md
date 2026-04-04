# WHITEBOARD_REACT_RUNTIME_SIMPLIFICATION_PLAN.zh-CN

## 目标

把 `whiteboard-react` 从当前的多上下文、多 service bag、多 hook 二次组装结构，收敛成一套更直接的运行时模型：

- 子模块只做纯能力
- 组装层负责把纯能力拼成可用 bridge
- 最终只暴露一个中轴 API
- 业务和 UI 侧统一通过 `useWhiteboard()` 读取能力

目标不是“继续分层”，而是减少概念、减少跳转、减少跨层认知成本。

---

## 当前问题

### 1. 一级概念过多

当前 React 侧同时暴露这些一级概念：

- `editor`
- `host`
- `environment`
- `resolvedConfig`
- `registry`

这些概念并列存在，导致调用方需要自己判断：

- 去哪读配置
- 去哪读 registry
- 去哪拿 insert
- 去哪拿 clipboard
- 去哪拿 pointer

这会让架构读起来像多套 runtime 并存，而不是一套白板运行时。

### 2. `host` 是 service bag，不是语义层

当前 `runtime/host/runtime.ts` 里聚合的是：

- `pick`
- `clipboard`
- `pointerSession`
- `selectionLock`
- `pointer`
- `insert`

这些能力本身并不属于同一个稳定领域对象。`host` 只是“很多宿主侧杂项能力的袋子”，不是一个真实有边界的模块。

结果就是：

- 看起来像核心 runtime
- 实际只是临时聚合对象
- 业务代码继续需要自己重新拼装这些能力

### 3. 输入链路在多个 hook 和 service 之间来回跳

例如 pointer 这条线目前分散在：

- `runtime/host/input.ts`
- `runtime/host/pointerSession.ts`
- `runtime/host/selectionLock.ts`
- `runtime/host/insert.ts`
- `canvas/usePointer.ts`

单个文件并不一定复杂，但整体阅读成本高。要理解“pointer down 到底怎么流”，需要多次跳转。

### 4. `useClipboardActions()` 这种二次组装 hook 是重复组合

剪贴板实际依赖：

- editor clipboard commands
- host clipboard adapter
- host pointer state

这些依赖当前在 hook 里再次组合，说明组合层位置不稳定。  
同样的问题未来也容易在 pointer、insert、context menu 上继续出现。

### 5. `environment` 的存在价值偏弱

`EnvironmentProvider` 目前只装：

- `registry`
- `config`

这两个值并不构成一个独立 runtime。它们更像白板中轴对象里的两个普通字段。

---

## 长期最优目标

### 核心原则

React 侧只保留一套白板运行时中轴：

- `whiteboard`

其他能力都挂在它下面，不再让调用方直接面对 `host`、`environment` 这些中间概念。

### 最终使用方式

最终目标是：

```ts
const whiteboard = useWhiteboard()
```

然后按字段读取：

- `whiteboard.editor`
- `whiteboard.engine`
- `whiteboard.registry`
- `whiteboard.config`
- `whiteboard.pointer`
- `whiteboard.clipboard`
- `whiteboard.insert`

`useEditor()`、`useNodeRegistry()`、`useResolvedConfig()` 这些可以保留，但都应该只是 `useWhiteboard()` 的薄封装。

---

## 建议的运行时分层

### 1. 纯模块层

这层只做无状态或局部状态的小能力，不代表白板 runtime。

建议保留的纯模块：

- `domTargets`
- `event`
- `input`
- `shortcut`
- `clipboard`
- `pointerSession`
- `pickRegistry`

这层的要求：

- 不感知 React context
- 不拼业务流程
- 只做纯解析、DOM 适配、浏览器能力包装

### 2. bridge 组装层

这层负责把多个纯模块拼成“能做一整件事”的宿主侧能力。

长期最优建议拆成 3 个 bridge：

#### `pointerBridge`

负责：

- pick 解析
- pointer world state
- pointer capture session
- selection lock
- DOM pointer event -> editor input
- insert pointerdown 优先分流
- pan 策略前置判断

不再让 `usePointer()` 自己组合这些能力。

#### `clipboardBridge`

负责：

- 系统 clipboard adapter
- editor clipboard commands
- 默认 paste origin 解析
- copy / cut / paste actions

不再单独保留 `useClipboardActions()` 作为二次组装 hook。

#### `insertBridge`

负责：

- insert preset catalog
- insert preset 执行
- 选中与 edit follow-up
- 插入工具 pointerdown 分流

这部分属于 product/host 层，不应回流到 editor。

### 3. 中轴层

这层只负责创建一次并暴露稳定 API。

建议引入单一中轴对象：

```ts
type WhiteboardRuntime = {
  editor: ...
  engine: ...
  registry: ...
  config: ...
  pointer: ...
  clipboard: ...
  insert: ...
}
```

这个对象由 `useWhiteboardRuntime()` 创建，并作为唯一 runtime value 提供给 React 树。

---

## 建议的 context 收敛

### 当前

当前存在：

- `EditorProvider`
- `HostProvider`
- `EnvironmentProvider`

### 目标

长期最优建议只保留：

- `WhiteboardProvider`

它直接提供最终中轴对象。

### 兼容型薄 hook

以下 hook 可以保留，但都应退化成中轴投影：

- `useWhiteboard()`
- `useEditor()`
- `useNodeRegistry()`
- `useResolvedConfig()`

例如：

- `useEditor()` 只是 `useWhiteboard().editor`
- `useNodeRegistry()` 只是 `useWhiteboard().registry`
- `useResolvedConfig()` 只是 `useWhiteboard().config`

### 应删除的一级概念

应从外部调用层删除：

- `useHostRuntime()`
- `HostProvider`
- `EnvironmentProvider`

原因不是它们做不到，而是它们不该成为公共理解模型的一部分。

---

## 目录重组建议

### 当前问题

`runtime/host` 这个目录名语义太宽，里面既有纯 DOM 工具，又有运行时组装，又有业务 bridge。

### 长期最优目录

建议调整成下面两层：

```txt
runtime/
  bridge/
    pointer.ts
    clipboard.ts
    insert.ts
  dom/
    clipboard.ts
    domTargets.ts
    event.ts
    input.ts
    pickRegistry.ts
    pointerSession.ts
    shortcut.ts
```

如果你希望目录更少，也可以把 `bridge/` 直接放在 `runtime/whiteboard/` 下面，但语义上分成 `bridge` 和 `dom` 会更清楚。

### 不建议继续保留

不建议继续保留：

```txt
runtime/host/
```

因为它会持续暗示“这里是另一套 runtime 核心”，但实际上只是宿主桥接层。

---

## `useWhiteboardRuntime()` 的长期最优职责

当前 `useWhiteboardRuntime()` 已经承担了：

- engine 创建
- editor 创建
- host runtime 创建
- registry 初始化

长期最优是把它变成唯一组装入口：

### 输入

- `document`
- `onDocumentChange`
- `coreRegistries`
- `nodeRegistry`
- `resolvedConfig`
- `boardConfig`

### 内部创建

- `engine`
- `editor`
- `registry`
- `pointerBridge`
- `clipboardBridge`
- `insertBridge`

### 输出

输出唯一中轴对象和少数生命周期依赖：

```ts
{
  whiteboard,
  inputDocument,
  lastOutboundDocumentRef,
  onDocumentChangeRef
}
```

其中：

```ts
whiteboard = {
  editor,
  engine,
  registry,
  config: resolvedConfig,
  pointer,
  clipboard,
  insert
}
```

---

## 各 hook 的长期职责边界

### `usePointer()`

当前过重。长期最优应只负责：

- 绑定 / 解绑 DOM pointer 事件
- 调用 `pointerBridge`

不再自己拼：

- pointer session
- selection lock
- host pointer state
- insert priority handling
- input resolve

这些都应收进 `pointerBridge`。

### `useClipboard()`

长期最优应只负责：

- 绑定 copy/cut/paste 事件
- 调用 `whiteboard.clipboard`

不再通过单独 `useClipboardActions()` 再组一次。

### `useKeyboard()`

这条线已经相对干净，但长期最优也应遵循同一规则：

- 事件绑定留在 hook
- shortcut resolve / action run 留在纯模块或 bridge
- 不额外引入新的 context 层

### `useBindViewportInput()`

这条线本身不算最绕，但从长期一致性考虑，也可以视为 viewport bridge 的一部分。

如果后面继续收敛，可把它改成：

- `viewportBridge.bind(container, options)`

然后 hook 只做生命周期绑定。

---

## 最终最少概念模型

长期最优希望 React 侧外部理解模型只剩下这些概念：

- `editor`
- `engine`
- `registry`
- `config`
- `pointer`
- `clipboard`
- `insert`

不再要求理解：

- `host`
- `environment`
- `host runtime`
- `clipboard actions hook`
- `host pointer state`

这些都应该退到内部实现里。

---

## 推荐实施顺序

### 阶段 1

先引入单一中轴 `useWhiteboard()`，但保留旧 hook 作为薄代理。

目标：

- 不改变现有 UI 使用方式
- 先让顶层概念收敛

### 阶段 2

把 `host` 能力拆成：

- `pointerBridge`
- `clipboardBridge`
- `insertBridge`

并把 `useClipboardActions()` 内联到 bridge。

### 阶段 3

删除：

- `HostProvider`
- `EnvironmentProvider`
- `useHostRuntime()`

让组件只从 `useWhiteboard()` 及其薄代理取值。

### 阶段 4

把 `runtime/host` 重命名为更贴近语义的目录：

- `runtime/bridge`
- `runtime/dom`

---

## 是否值得做

值得。

原因不是“性能”或“文件太多”，而是：

- 当前 React 侧复杂度主要来自组合方式，不来自底层模型
- editor kernel 已经比较稳定
- 现在正适合把宿主层语义收敛，不然以后会继续在 `host` 上累积历史负担

这类重构一旦完成，后面加功能时会明显更顺：

- 新增输入能力时只改 bridge
- 新增 UI 能力时只从 `useWhiteboard()` 取值
- 不再需要在 editor / host / environment 三者之间来回判断

---

## 最终结论

`whiteboard-react` 现在的问题不是“模块太多”，而是“中轴不清晰”。

长期最优不是继续微调 `runtime/host`，而是：

- 删掉 `host` 作为一级概念
- 删掉 `environment` 作为一级概念
- 建立单一 `useWhiteboard()` 中轴
- 把宿主侧复杂流程收进少数 bridge
- 让 hook 只保留 React 生命周期绑定职责

这是当前 React 侧最值得做的一轮结构收敛。
