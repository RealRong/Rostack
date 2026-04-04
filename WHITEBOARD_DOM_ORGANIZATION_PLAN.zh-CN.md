# WHITEBOARD_DOM_ORGANIZATION_PLAN.zh-CN

## 目标

把 `whiteboard-react` 里和 DOM 相关的实现从“按历史位置分散”收敛成一套清晰、长期稳定的组织方式。

目标不是把所有涉及 DOM 的代码都塞进同一个目录，而是先区分：

- 哪些是宿主输入 DOM
- 哪些是通用视图 DOM
- 哪些是 feature 专属 DOM

只有先把这三类边界切清楚，后续目录、命名、抽象才不会反复漂移。

---

## 当前问题

当前 DOM 相关实现主要分散在两块：

- `whiteboard/packages/whiteboard-react/src/runtime/dom`
- `whiteboard/packages/whiteboard-react/src/features/node`

这两块里都存在大量 DOM 逻辑，但它们不是同一种职责。

### `runtime/dom` 当前职责

这块主要是宿主输入和浏览器适配：

- DOM target 判定
- pointer / wheel / keyboard input 解析
- pointer capture
- document selection lock
- clipboard adapter
- shortcut map

典型文件：

- `runtime/dom/domTargets.ts`
- `runtime/dom/input.ts`
- `runtime/dom/pointerSession.ts`
- `runtime/dom/selectionLock.ts`
- `runtime/dom/clipboard.ts`
- `runtime/dom/shortcut.ts`

### `features/node` 当前 DOM 职责

这里混着三类 DOM：

1. 节点编辑 DOM
- `textContent.ts`
- `registry/default/text.tsx`
- `registry/default/shape.tsx`
- `registry/default/frame.tsx`

2. 节点测量 DOM
- `textLayout.ts`
- `hooks/useAutoFontSize.ts`
- `hooks/useNodeSizeObserver.ts`

3. 组件局部 DOM 细节
- `NodeItem.tsx` 里的 ref 组装
- `FrameLayer.tsx` 里的 ref / element 绑定

问题不在于“DOM 太多”，而在于：

- `runtime/dom` 这个名字太宽
- `features/node` 内部又藏了大量真正重要的 DOM 机制
- 当前边界无法表达“宿主 DOM”和“节点视图 DOM”是两套不同的问题域

---

## 结论

长期最优不是把 `features/node` 的 DOM 逻辑全部并进 `runtime/dom`。

长期最优是：

- 把 `runtime/dom` 提升成更明确的 `dom` 层
- 在 `dom` 层里区分“宿主 DOM”和“通用视图 DOM”
- 把 node 专属的 DOM 机制收敛到 `features/node/dom`

也就是：

- 平台宿主问题放全局 `dom`
- feature 专属 DOM 机制留在 feature 内
- 只把真正可复用的 DOM helper 往上抽

---

## 长期最优目录

推荐目录结构如下：

```txt
whiteboard-react/src/
  dom/
    host/
      targets.ts
      input.ts
      event.ts
      pointerSession.ts
      selectionLock.ts
      clipboard.ts
      shortcut.ts
      pickRegistry.ts
    observe/
      useElementSize.ts
      resize.ts
    editable/
      text.ts
      selection.ts
  features/
    node/
      dom/
        textLayout.ts
        textSourceRegistry.ts
        nodeSizeObserver.ts
        editableText.ts
      components/
      hooks/
      registry/
```

这套结构的核心不是“多一层目录”，而是让每一层都只表达一种 DOM 语义。

---

## 分层职责

### 1. `dom/host`

这一层只处理宿主输入和浏览器平台适配。

它回答的问题是：

- 某个 DOM target 应不应该忽略
- pointer / wheel / keyboard 如何翻译成 editor input
- pointer capture 如何管理
- 系统 clipboard 如何接入
- 浏览器快捷键如何映射

这一层不应该关心：

- node
- text
- frame
- auto font
- node size writeback

换句话说，这一层应该完全是“whiteboard runtime 的宿主接口层”。

适合放进来的模块：

- `runtime/dom/domTargets.ts`
- `runtime/dom/input.ts`
- `runtime/dom/event.ts`
- `runtime/dom/pointerSession.ts`
- `runtime/dom/selectionLock.ts`
- `runtime/dom/clipboard.ts`
- `runtime/dom/shortcut.ts`
- `runtime/dom/pickRegistry.ts`

---

### 2. `dom/observe`

这一层放纯通用 DOM 观察能力。

它回答的问题是：

- 元素尺寸怎么观察
- 元素尺寸变化怎么做最小化通知
- 是否需要统一 `ResizeObserver` 小工具

这一层不应该关心：

- editor command
- node document update
- 具体 node type

适合放进来的模块：

- `runtime/hooks/useElementSize.ts`

不适合直接放进来的模块：

- `useNodeSizeObserver.ts`

因为 `useNodeSizeObserver.ts` 不只是观察，它还承担了：

- nodeId 到 element 的注册
- 尺寸去抖
- 尺寸比较
- 回写 `editor.commands.node.document.updateMany`

这已经是 node feature 语义，不是纯观察能力。

---

### 3. `dom/editable`

这一层放通用 editable DOM helper。

它回答的问题是：

- contenteditable 如何读取纯文本
- 如何把光标移动到末尾
- 以后如果需要，如何统一 selection/caret helper

这一层不应该关心：

- node id
- editor commit/cancel
- text node / shape / frame 的具体产品逻辑

适合放进来的模块：

- `features/node/textContent.ts`

也就是：

- `readEditableText`
- `focusEditableEnd`

这两个函数本质上不是 node domain，它们只是 editable DOM 工具。

---

### 4. `features/node/dom`

这一层放 node 专属的 DOM 机制。

它回答的问题是：

- 节点文本如何测量
- 节点自动字号如何调度
- 节点 source element 如何登记
- 节点尺寸如何从 DOM 观察后回写文档
- 节点编辑期有哪些通用交互片段

这层是 feature 的底层机制，但仍然属于 node feature，而不是全局 DOM 平台层。

适合放进来的模块：

- `features/node/textLayout.ts`
- `features/node/hooks/useNodeSizeObserver.ts`

以及未来可以新增的：

- `features/node/dom/textSourceRegistry.ts`
- `features/node/dom/editableText.ts`

这类模块虽然操作 DOM，但它们强依赖：

- node rect
- node field
- editor node text commands
- node size writeback

所以不应该被抬升到 `dom/host`。

---

## 具体文件该怎么归类

### 应该上移到全局 `dom`

#### `textContent.ts`

当前文件：

- `features/node/textContent.ts`

建议目标：

- `dom/editable/text.ts`

原因：

- 只是 contenteditable 的读值和光标控制
- 不依赖 node model
- 以后 edge label / mindmap label / 其他富文本节点也可能复用

---

### 应该从 `runtime/hooks` 挪到 `dom`

#### `useElementSize.ts`

当前文件：

- `runtime/hooks/useElementSize.ts`

建议目标：

- `dom/observe/useElementSize.ts`

原因：

- 本质不是 runtime hook
- 只是一个通用 DOM size observer
- 挂在 `runtime/hooks` 会误导它属于运行时状态层

---

### 应该留在 node feature 内，但收成 `node/dom`

#### `textLayout.ts`

当前文件：

- `features/node/textLayout.ts`

建议目标：

- `features/node/dom/textLayout.ts`

原因：

- 它不是普通 DOM helper
- 它是 node 文本布局和测量引擎
- 强依赖 node text variant、editor、text size policy

这类模块如果抬到全局 `dom`，只会把“node 专属复杂度”伪装成“通用 DOM”，反而更难维护。

#### `useNodeSizeObserver.ts`

当前文件：

- `features/node/hooks/useNodeSizeObserver.ts`

建议目标：

- `features/node/dom/nodeSizeObserver.ts`

原因：

- 它不只是 observer
- 它是“DOM size -> node document size”的 feature 管线
- 里面有明确的 nodeId / command / updateMany 语义

---

### 应该在 node feature 内新增一个更清晰的编辑 helper

当前这些文件里有明显重复的编辑期 DOM 行为：

- `registry/default/text.tsx`
- `registry/default/shape.tsx`
- `registry/default/frame.tsx`

重复点包括：

- focus 到末尾
- contenteditable / input 读值
- `Escape` 取消
- `Cmd+Enter` / `Ctrl+Enter` 提交
- `onPointerDown` 阻止冒泡

这类逻辑不建议并进 `dom/host`，因为它们已经带有 node 编辑语义。

长期最优建议是新增：

- `features/node/dom/editableText.ts`

负责沉淀 node 编辑期可复用的 DOM 片段，例如：

- 读 editable value
- 首次聚焦到末尾
- 统一的 keydown 约定
- 统一的 pointer stopPropagation 约定

这样能减少 `text.tsx` 和 `shape.tsx` 的重复，而不污染全局 DOM 层。

---

## 判断标准

后面只要遇到一个新 DOM 模块，可以用下面的标准判断放哪。

### 放 `dom/host`

满足任一条件：

- 它直接处理浏览器输入事件
- 它决定输入事件如何映射到 editor
- 它是 clipboard / pointer capture / shortcut / target ignore 之类的平台适配

### 放 `dom/observe`

满足任一条件：

- 它只做元素观察
- 它不关心 whiteboard feature 语义
- 它可以独立于 node/editor 存在

### 放 `dom/editable`

满足任一条件：

- 它只操作 contenteditable / input / DOM selection
- 它不依赖 nodeId / editor command
- 它是通用的 DOM 编辑 helper

### 放 `features/node/dom`

满足任一条件：

- 它依赖 node rect / node field / node command
- 它会把 DOM 测量结果回写 node document
- 它服务于 node text / node title / node size 的 feature 机制

---

## 不推荐的方向

### 1. 不要把所有 DOM 都塞进 `runtime/dom`

这样会让 `runtime/dom` 变成浏览器相关的杂物箱。

结果是：

- runtime 边界继续变脏
- node feature 的底层机制被错误提升
- 文件名看起来通用，实际却强依赖 node domain

### 2. 不要把所有 node DOM 都抽成全局公共层

比如 `textLayout.ts` 这种模块，虽然是 DOM，但本质是 node feature engine。

如果为了“统一 DOM”把它提到全局层，最终只会得到：

- 更宽的接口
- 更多上下文参数
- 更差的可读性

### 3. 不要把“React hook”和“DOM helper”混成一个抽象

例如 `useElementSize` 这种，应该按能力归类，不应该因为它是 hook 就默认放 `runtime/hooks`。

---

## 推荐实施顺序

### 阶段 1

先重命名和搬目录，不改行为：

- `runtime/dom` -> `dom/host`
- `runtime/hooks/useElementSize.ts` -> `dom/observe/useElementSize.ts`
- `features/node/textContent.ts` -> `dom/editable/text.ts`

### 阶段 2

把 node 专属 DOM 机制收进：

- `features/node/dom/textLayout.ts`
- `features/node/dom/nodeSizeObserver.ts`

### 阶段 3

把 `text.tsx`、`shape.tsx`、`frame.tsx` 里重复的编辑期 DOM 逻辑沉淀成：

- `features/node/dom/editableText.ts`

### 阶段 4

最后再看是否需要给 `dom` 层补一个聚合入口，但不强制。

---

## 最终结论

`whiteboard-react` 里的 DOM 不应该按“都和浏览器有关”来组织，而应该按语义边界组织：

- 宿主输入 DOM
- 通用视图 DOM
- feature 专属 DOM

长期最优不是把 `features/node` 并到 `runtime/dom`，而是：

- 把 `runtime/dom` 升级成更准确的 `dom` 层
- 只把真正通用的 DOM helper 往上抽
- 把 node 专属 DOM 机制收拢到 `features/node/dom`

这会比单纯“统一目录名”更稳定，也更能长期降低复杂度。
