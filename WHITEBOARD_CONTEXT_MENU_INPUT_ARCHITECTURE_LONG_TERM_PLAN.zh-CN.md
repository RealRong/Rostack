# Whiteboard Context Menu Input Architecture Long-Term Plan

## 背景

当前 whiteboard 的右键菜单已经在产品层面逐步清晰：

- selection menu 和 `NodeToolbar more` 已经统一到同一个 `SelectionActionMenu`
- `ContextMenu.tsx` 也已经收敛成以右键 popover 为中心的 host/router

但还有一个明显的架构问题没有解决：

- `ContextMenu.tsx` 仍然直接做 selection 语义决策
- 具体表现为它会在命中 node / edge / group 时主动调用 selection mutation
- 例如：
  - `syncNodeSelection(...)`
  - `syncSingleEdgeSelection(...)`
  - `editor.commands.selection.replace(...)`

这意味着 React chrome 组件不仅负责：

- 监听 DOM `contextmenu`
- 解析命中结果
- 打开 popover
- 路由具体 menu component

还额外负责：

- 决定右键时 selection 是否需要切换
- 决定 group / edge / background 的语义分支

这层职责已经越过了“UI host”边界，进入了 editor input semantics。

## 结论

### 1. 当前做法是可运行的，但从长期架构上是错误位置

`ContextMenu.tsx` 里直接做：

- `syncNodeSelection`
- `syncSingleEdgeSelection`
- `selection.replace`

从短期工程上是可以接受的，因为当前系统里右键没有接入统一 input pipeline。

但从长期最优架构看，这些逻辑不应该继续留在 `ContextMenu.tsx`。

根本原因不是 “React 组件里不该调用 command” 这么简单，而是：

- 右键命中后的 selection 同步是 editor 交互语义
- 不应该由某个具体 chrome 组件私自定义

### 2. 长期最优方案不是让 editor 接收原始 DOM `contextmenu`

这里要明确一个边界：

- editor 不应该直接接收 DOM `MouseEvent`
- editor 不应该知道 `addEventListener('contextmenu', ...)`
- editor 不应该依赖 React host / browser event 细节

长期最优方案应当是：

- host 负责捕获 DOM `contextmenu`
- bridge 负责 `resolvePoint`
- editor input 负责处理“右键语义输入”

也就是：

- editor 接收抽象后的 `context menu input`
- 而不是接收原始 DOM 事件

### 3. 明确采用“输入语义下沉到 editor.input”方案

不保留双路线，不做过渡性兼容设计。

明确最终方案为：

- `ContextMenu.tsx` 只做 host / popover / route
- `pointer bridge` 或新的 `context menu bridge` 负责把 DOM 右键事件转成抽象输入
- `editor.input` 新增专门的 `contextMenu(...)` 入口
- 右键前 selection 是否切换，由 `editor.input.contextMenu(...)` 统一决定
- 菜单最终显示哪一类 view，也由该输入语义层统一产出

换句话说：

- UI 层不再做 selection 同步
- selection 语义正式进入 editor input system

## 为什么必须这样做

## 1. 当前架构把“输入语义”和“菜单渲染”绑在一起了

现在 `ContextMenu.tsx` 同时承担两类职责：

- 输入职责
  - 监听 `contextmenu`
  - 命中解析
  - 右键前 selection 同步
- 视图职责
  - 打开 popover
  - 分发 `canvas / selection / edge` menu

这会导致几个长期问题：

- 右键 selection 语义只能在这个组件内部维护
- 以后如果出现其他触发入口，行为容易分叉
- editor interaction 的一致性无法保证
- 测试粒度会停留在 React chrome，而不是 editor input 语义

## 2. 右键 selection 同步本质上是 interaction rule

“右键命中未选中的 node 时，是否切换到该 node 再开菜单”

“右键命中 edge 时，是否替换当前 selection”

“右键命中 group 时，应该打开 group selection 还是 background”

这些都不是 menu component 的职责。

这些是 editor 的交互规则。

因此它们应该和：

- pointer down
- pointer move
- key down
- wheel

处于同一类系统里，而不是散落在 chrome 组件内部。

## 3. 现在的系统已经暴露出这个缺口

当前左键输入路径已经是统一的：

- host 捕获 pointer
- bridge 组装 input
- `editor.input.pointerDown(...)`

但右键被显式排除在这个通道外：

- `usePointer` 对 `event.button === 2` 直接 return
- `editor.input` 目前也没有 `contextMenu` / `secondaryAction` 入口

于是 `ContextMenu.tsx` 被迫自己做了 selection 语义补丁。

这不是最终设计，只是当前系统缺少右键输入接口后的局部补偿。

## 最终架构

### 1. 目标职责边界

最终应拆成四层：

#### A. Host Layer

负责：

- 监听 DOM `contextmenu`
- 阻止浏览器默认菜单
- 触发 runtime 的右键输入入口
- 根据返回结果决定是否渲染 popover

不负责：

- selection 切换
- group / edge / canvas 语义判断
- 菜单项数据生成

#### B. Bridge Layer

负责：

- `resolvePoint`
- 将 DOM event 转成稳定的 runtime input
- 屏蔽 DOM/React/browser 细节

不负责：

- 最终 selection mutation policy
- menu 渲染

#### C. Editor Input Layer

负责：

- 定义右键交互规则
- 决定命中对象是否应成为当前 selection
- 决定右键打开的是 `canvas`、`selection` 还是 `edge`
- 返回稳定的 context menu intent

这层是长期正确的语义归属。

#### D. Menu View Layer

负责：

- 根据 intent 渲染对应菜单
- selection 走 `SelectionActionMenu`
- canvas / edge 走各自 menu component

不负责：

- 输入策略
- selection policy

### 2. 明确输入链路

最终链路明确为：

1. host 捕获 `contextmenu`
2. bridge 调用 `resolvePoint`
3. bridge 组装 `ContextMenuInput`
4. 调用 `editor.input.contextMenu(input)`
5. editor 内部完成必要 selection 同步
6. editor 返回 `ContextMenuIntent | null`
7. `ContextMenu.tsx` 根据 intent 渲染 popover

也就是说：

- `ContextMenu.tsx` 不再直接读 selection 来决定语义
- `ContextMenu.tsx` 不再直接调用 `syncNodeSelection` / `syncSingleEdgeSelection`
- `ContextMenu.tsx` 只消费 editor 返回的结果

## 推荐的数据结构

### 1. `ContextMenuInput`

建议新增抽象输入类型：

```ts
type ContextMenuInput = {
  client: Point
  screen: Point
  world: Point
  pick: EditorPick
  editable: boolean
  ignoreInput: boolean
  ignoreSelection: boolean
  ignoreContextMenu: boolean
  modifiers: {
    alt: boolean
    shift: boolean
    ctrl: boolean
    meta: boolean
  }
}
```

说明：

- 尽量复用现有 `ResolvedPoint` / `PointerInput` 里的字段模型
- 不把 DOM event 本体传进 editor
- 输入层只消费抽象数据

### 2. `ContextMenuIntent`

建议 editor 返回稳定的 intent，而不是让 UI 二次推断：

```ts
type ContextMenuIntent =
  | {
      kind: 'canvas'
      screen: Point
      world: Point
    }
  | {
      kind: 'selection'
      screen: Point
      selection: {
        nodeIds: readonly string[]
        edgeIds: readonly string[]
      }
    }
  | {
      kind: 'edge'
      screen: Point
      edgeId: string
    }
```

设计原则：

- intent 必须是菜单渲染可直接消费的最终语义
- UI 不再根据 `pick.kind` 再推导一次
- 任何右键 selection policy 都在 editor 内部被消化完

## 明确的交互规则归属

以下规则全部归 `editor.input.contextMenu(...)`，不再归 React chrome：

- 右键命中未选中的 node 时，是否替换当前 selection
- 右键命中已选中 node 时，是否复用现有 selection
- 右键命中 edge 时，是否切换成单 edge selection
- 右键命中 group 时，是打开 group selection 还是回退到 canvas
- 右键点在 selection box body 时，应打开 selection menu 还是 canvas menu
- 当前 interaction busy 时，是否拒绝打开 context menu

这些规则未来如果要调整，统一改 editor input，不允许再从 menu host 层绕开。

## 对现有代码的明确否定

以下形态在长期方案中明确禁止继续保留：

- `ContextMenu.tsx` 内部直接调用 `syncNodeSelection(...)`
- `ContextMenu.tsx` 内部直接调用 `syncSingleEdgeSelection(...)`
- `ContextMenu.tsx` 内部直接调用 `editor.commands.selection.replace(...)`
- `ContextMenu.tsx` 自己根据 `pick.kind` 维护完整 selection policy

原因很简单：

- 这些都是 editor interaction 规则
- 不属于 menu host

## 不保留兼容层

本方案明确：

- 不在乎改造成本
- 不优先最小 diff
- 不保留过渡期双入口
- 不保留“先 bridge 里补一层，未来再说”的半状态

长期最优的实现应直接完成以下重构：

- `editor.input` 增加正式的 `contextMenu(...)`
- host 改为只调用这一个入口
- 原有 `ContextMenu.tsx` 里的 selection sync 全部删除

如果某些已有 helper 只是为旧架构存在，也应同步删除，而不是继续保留兼容壳。

## 推荐的最终接口形态

### 1. Editor Input

建议最终直接扩展为：

```ts
type EditorInput = {
  pointerDown: ...
  pointerMove: ...
  pointerUp: ...
  pointerCancel: ...
  pointerLeave: ...
  wheel: ...
  keyDown: ...
  keyUp: ...
  blur: ...
  cancel: ...
  contextMenu: (input: ContextMenuInput) => ContextMenuIntent | null
}
```

这比把右键语义塞进：

- `pointerDown(button === 2)`
- `ContextMenu.tsx`
- 某个 selection util

都更干净。

### 2. Bridge

bridge 最终建议提供：

```ts
type PointerBridge = {
  ...
  contextMenu: (input: {
    container: Element
    event: Pick<MouseEvent, 'target' | 'clientX' | 'clientY' | 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey'>
  }) => ContextMenuIntent | null
}
```

bridge 内部做：

- `resolvePoint`
- 组装 `ContextMenuInput`
- 转发给 `editor.input.contextMenu(...)`

这样 host 根本不需要知道 `ResolvedPoint` 细节。

### 3. React Host

`ContextMenu.tsx` 最终只保留：

- `addEventListener('contextmenu', ...)`
- `pointer.contextMenu(...)`
- `setIntent(...)`
- 渲染 `WhiteboardPopover`

换句话说，它最终应该是一个几乎没有业务语义的 shell。

## 目标状态下的文件职责

### `whiteboard-react`

- `ContextMenu.tsx`
  - 纯 host/router
- `runtime/bridge/pointer.ts`
  - 提供右键输入桥接入口
- `selection/chrome/panels/*`
  - 纯菜单视图

### `whiteboard-editor`

- `types/editor.ts`
  - 新增 `contextMenu(...)`
- `types/input.ts`
  - 新增 `ContextMenuInput`
- `runtime/editor/input.ts`
  - 实现右键语义处理
- interaction / selection 相关逻辑
  - 收口右键 selection policy

## 直接收益

采用最终架构后，收益非常明确：

- selection policy 不再散落在 React chrome
- 右键交互规则进入 editor 统一输入系统
- `ContextMenu.tsx` 彻底降级为 UI host
- 未来新增其他右键入口时，不会复制 selection 同步逻辑
- 菜单渲染层和输入语义层彻底解耦
- 测试可以直接围绕 `editor.input.contextMenu(...)` 做，不必依赖 UI 事件链

## 明确不采用的方案

### 1. 不采用“继续维持现状”

原因：

- 逻辑位置错误
- 后续只会继续积累隐性耦合

### 2. 不采用“仅把逻辑下沉到 `ContextMenu` util”

原因：

- 只是把 React 文件拆小
- 没有真正进入 editor input system

### 3. 不采用“只放到 bridge，不进入 editor.input”

这比现在好一点，但仍不是长期最优。

原因：

- bridge 的职责应偏向输入转换
- 不应该长期承载完整 selection policy

bridge 可以承接输入组装，但最终右键语义仍应落到 `editor.input`。

## 最终决定

最终决定如下：

- `ContextMenu.tsx` 不再拥有 selection sync 逻辑
- 右键 selection policy 全部进入 `editor.input.contextMenu(...)`
- host 只负责 DOM 监听和 popover 渲染
- bridge 只负责输入转换和转发
- 不保留兼容路径
- 不为过渡期成本妥协架构边界

这是 whiteboard context menu 输入架构的长期唯一正确方向。
