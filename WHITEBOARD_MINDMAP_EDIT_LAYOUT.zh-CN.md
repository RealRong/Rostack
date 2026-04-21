# Whiteboard Mindmap Edit Layout

本文定义 whiteboard `mindmap` 在编辑态 auto width 与 preview layout 的长期最优模型、API 与实施方案。

目标固定为：

- 模型最少
- 职责最清
- 语义稳定
- 不依赖时序巧合
- 性能不低于现状
- 不考虑重构成本
- 不保留兼容层

本文不重复调试过程，只给最终结论。

---

## 1. 固定结论

长期最优下，`mindmap` 编辑态布局必须遵守下面六条硬规则：

1. `root` 和 `topic` 都是普通 `node`，继续参与 selection、toolbar、edge connect、node.read。
2. 编辑态 auto width 属于 `draft layout`，不是 `TextSlot` 行为，不是 `gesture preview` 行为。
3. `mindmap owned node` 的几何真相源只能有一个：`projected mindmap layout`。
4. `gesture preview` 只表达拖拽、插入预览、enter animation 这类交互位移，不能再承担文本编辑尺寸。
5. `layout backend.measure` 必须是纯测量契约；`DOM source` 只能是可选增强，不能是 correctness 依赖。
6. `commit` 与 `edit preview` 必须共享同一份临时布局来源；两者只能相差“是否持久化”，不能相差“走哪条布局线”。

一句话：

- `TextSlot` 只负责输入文本
- `draft` 负责文本与临时测量
- `projector` 负责把临时测量并入 mindmap layout
- `commit` 只负责把当前 draft 持久化

---

## 2. 当前问题的本质

当前现象是：

- 编辑态时，`root/topic` 宽度固定
- 离开编辑态后，宽度立刻和文本对齐

这说明：

- 最终提交后的尺寸计算大概率是对的
- 错的是编辑态的临时尺寸没有稳定进入当前显示中的 `mindmap layout`

根因不是单点 bug，而是同一个语义被拆成了两条半独立链路：

1. `edit input -> 临时 text/layout`
2. `mindmap layout -> 当前树的节点 rect`

只要这两条线不是同一个 projector 的输入和输出关系，就会继续出现：

- commit 正常，edit preview 异常
- 测试局部通过，真实页面时序不稳定
- root 与 topic 某一个能工作，另一个失效

---

## 3. 最终模型

长期最优下，这条线只保留四个状态域：

1. `committed`
2. `draft.text`
3. `draft.layout`
4. `projected.mindmap`

其中：

- `committed` 是 document / engine 里已经持久化的状态
- `draft.text` 是编辑中的文本草稿
- `draft.layout` 是根据草稿文本推导出来的临时尺寸
- `projected.mindmap` 是把 committed tree 与所有临时输入合成后的当前显示布局

不再允许出现：

- `TextSlot` 自己决定宽度
- `mindmap preview` 混入文本编辑尺寸
- `node.read` 对同一个 mindmap node 同时叠两套几何真相
- `action.input` 手工编排多步布局状态

---

## 4. 最终状态 API

## 4.1 `draft.text`

`draft.text` 只表达“哪个 node 正在编辑，以及草稿文本是什么”。

```ts
type DraftTextSession = {
  nodeId: NodeId
  field: 'text' | 'title'
  text: string
  caret: EditCaret
  composing: boolean
}

type DraftTextRead = {
  active: ReadStore<DraftTextSession | null>
  byNode: KeyedReadStore<NodeId, DraftTextSession | undefined>
}
```

约束：

- 这里只存文本语义，不存几何
- `composing` 仍然留在 text draft，而不是 layout draft
- `TextSlot.onInput` 只写这里

---

## 4.2 `draft.layout`

`draft.layout` 只表达“如果现在提交，这个 node 应该采用什么临时布局结果”。

```ts
type DraftNodeLayout = {
  size?: Size
  fontSize?: number
  wrapWidth?: number
}

type DraftLayoutRead = {
  node: KeyedReadStore<NodeId, DraftNodeLayout | undefined>
}
```

约束：

- `draft.layout` 不能持有 `text`
- `draft.layout` 只能由 `draft.text + committed node + layout backend` 推导
- `draft.layout` 是编辑期唯一尺寸来源

对 `mindmap text` 来说，这里最关键的是 `size`。

对 `sticky` 这类 `fit` 布局来说，这里最关键的是 `fontSize`。

---

## 4.3 `preview.gesture`

`preview.gesture` 只保留交互预览。

```ts
type MindmapGesturePreview =
  | {
      rootMove: {
        treeId: MindmapId
        delta: Point
      }
    }
  | {
      subtreeMove: {
        treeId: MindmapId
        nodeId: NodeId
        ghost: Rect
      }
    }
  | {
      enter: readonly MindmapEnterPreview[]
    }
```

约束：

- 这里不再放编辑态尺寸
- 文本输入不会写这里
- 这层只解决拖拽与过渡动画

---

## 4.4 `projected.mindmap`

`projected.mindmap` 是 mindmap-owned node 的唯一几何真相源。

```ts
type ProjectedMindmapLayout = {
  item: KeyedReadStore<MindmapId, MindmapLayoutItem | undefined>
  nodeRect: KeyedReadStore<NodeId, Rect | undefined>
}
```

其输入固定为：

- committed `structure`
- committed node size / root anchor
- `draft.layout.node`
- `preview.gesture`

其输出固定为：

- projected tree bbox
- projected node rect
- projected connectors

约束：

- `root/topic` 都从这里取 rect
- `node.read` 不再自己给 mindmap node 叠第二套 edit-time size
- `mindmap chrome / connectors / node body` 都消费同一个 projected layout

---

## 5. 最终管线

## 5.1 编辑态输入管线

```ts
TextSlot.onInput(text)
  -> actions.edit.input(text)
  -> draft.text.active = { nodeId, field, text, caret, composing }
  -> draft.layout.node[nodeId] = measure(draft.text, committed node, layout backend)
  -> projected.mindmap = project(committed tree, draft.layout, gesture preview)
  -> node.render(rect) 读取 projected.mindmap.nodeRect(nodeId)
```

这里最关键的变化是：

- `actions.edit.input` 不再手工写 `layout.size`
- `draft.layout` 由独立 projector / reconciler 推导
- `mindmap` 读取的是 projector 结果，不是 action 手工塞进去的临时 patch

---

## 5.2 拖拽预览管线

```ts
pointer move
  -> preview.gesture.rootMove / subtreeMove
  -> projected.mindmap = project(committed tree, draft.layout, gesture preview)
  -> node.render / mindmap.scene / connectors 同时更新
```

拖拽预览与编辑态 auto width 的关系应当是：

- 共享同一个 `projected.mindmap`
- 但输入命名空间不同

这样不会再长出第二个状态机。

---

## 5.3 提交管线

```ts
actions.edit.commit()
  -> read draft.text
  -> read draft.layout
  -> node.text.commit({ value, size, fontSize, wrapWidth })
  -> committed document 更新
  -> clear draft.text
  -> clear draft.layout
  -> projected.mindmap 回落到 committed + gesture preview
```

约束：

- commit 使用的 `size/fontSize/wrapWidth` 必须直接来自 `draft.layout`
- 不再单独调用另一套测量逻辑

---

## 6. 读取链的最终职责

## 6.1 `node.read`

`node.read` 长期最优下只做两件事：

1. 读取 node 内容
2. 组合唯一几何来源

对普通 document node：

- 几何来自 committed rect + 通用 preview / draft layout

对 mindmap-owned node：

- 几何来自 `projected.mindmap.nodeRect`

因此，长期最优下不再允许这种组合：

- 先对 mindmap node 应用 edit-size
- 再用 mindmap layout 覆盖一遍 rect

这会制造“两套局部都像真相”的错误模型。

---

## 6.2 `mindmap.read`

`mindmap.read` 保持之前已经收敛好的四层：

1. `structure`
2. `layout`
3. `scene`
4. `chrome`

但这里的 `layout` 必须明确区分：

- `committed.layout`
- `projected.layout`

长期最优 API：

```ts
type MindmapRead = {
  structure: MindmapStructureRead
  committedLayout: MindmapLayoutRead
  projectedLayout: MindmapLayoutRead
  scene: MindmapSceneRead
  chrome: MindmapChromeRead
}
```

其中 UI 默认消费 `projectedLayout`。

---

## 7. Layout Backend 契约

长期最优下，`LayoutBackend.measure` 必须满足下面规则：

1. 输入是完整 `LayoutRequest`
2. 输出只依赖 request，不依赖外部编辑时序
3. `source` 是可选 hint，不是 correctness 依赖
4. 没有 `source` 时也必须给出正确的文本测量结果

也就是说：

- `TextSourceStore` 可以保留
- 但只作为“尽量复用真实 DOM typography”的优化
- 不能决定编辑态 auto width 是否工作

对 built-in text / mindmap topic：

- 只要 `typography + fontSize + frame + text + widthMode` 已知
- 后端就应该能稳定给出同类结果

---

## 8. Action API 最终形态

长期最优下，公开 `edit` API 应收敛为：

```ts
type EditorEditActions = {
  startNode(nodeId: NodeId, field: EditField, options?: StartEditOptions): void
  input(text: string): void
  caret(caret: EditCaret): void
  composing(value: boolean): void
  commit(): Result | undefined
  cancel(): Result | undefined
}
```

固定结论：

- 删除公开的 `edit.layout(...)`
- `layout` 不能再由 UI 直接 patch
- `TextSlot` 只发 `input / composing / caret / commit / cancel`

原因：

- `edit.layout` 暴露给 UI，本质上是在把布局系统泄漏到输入层
- 这会让测试和真实页面很容易走出两条不同的路径

---

## 9. 命名约束

长期最优下，这条线的命名固定如下：

- `draft.text`
- `draft.layout`
- `preview.gesture`
- `projected.mindmap`

不再使用：

- `liveEdit`
- `mindmapPreview` 表达编辑态尺寸
- `edit.layout` 作为公开动作

推荐内部命名：

```ts
type MindmapSizeOverride = {
  nodeId: NodeId
  size: Size
}
```

比 `liveEdit` 更稳定，因为它表达的是“布局覆盖值”，而不是“它从哪个交互场景来”。

---

## 10. 最终不变量

必须长期保持下面这些不变量：

1. `mindmap owned node` 的 rect 只来自 `projected.mindmap`。
2. `draft.layout` 是编辑态唯一尺寸来源。
3. `gesture preview` 不保存文本编辑尺寸。
4. `commit` 与 `edit preview` 使用同一份 `draft.layout`。
5. `TextSlot` 不计算节点宽度。
6. `DOM source` 缺失时，auto width 仍然必须正确。

只要满足这六条，`root/topic` 在编辑态与提交态的行为就会天然一致。

---

## 11. 实施方案

## 阶段 1：抽出 `draft.layout`

目标：

- 从 `actions.edit.input -> session.mutate.edit.layout(...)` 迁出临时布局推导

实施：

- 新增 `draft.layout` 读层
- 输入为 `draft.text.active`
- 输出为 `DraftNodeLayout`
- `actions.edit.input` 只写文本草稿

完成标准：

- 编辑动作层不再手工编排临时尺寸

---

## 阶段 2：把 `projected.mindmap` 改成统一 projector

目标：

- 让 `draft.layout` 和 `gesture preview` 共同输入同一个 mindmap projector

实施：

- `projected.mindmap` 接入 `sizeOverrideByNodeId`
- `rootMove/subtreeMove/enter` 保持原职责
- 输出统一为 projected tree layout

完成标准：

- root/topic 编辑态 auto width 与拖拽预览都经由同一 projector 生效

---

## 阶段 3：收敛 `node.read`

目标：

- 删除 mindmap node 的双重几何叠加

实施：

- 对 `owner.kind === 'mindmap'` 的 node，`node.read.geometry` 只读 `projected.mindmap.nodeRect`
- `applyTextDraft(size)` 只保留给非 mindmap 普通 text / sticky

完成标准：

- `node.read` 不再同时持有两套针对 mindmap 的 edit-time geometry

---

## 阶段 4：删除公开 `edit.layout`

目标：

- 清理旧 API 泄漏

实施：

- `TextSlot` 改为只调用 `input / composing / commit / cancel`
- 所有测试切换到真实输入路径

完成标准：

- 不再存在“测试通过但真实页面走的是另一条编辑布局线”的可能

---

## 12. 最终结论

这条线的长期最优答案不是继续给 `mindmapPreview` 加字段，也不是在 `TextSlot` 里补一个局部 auto width hack。

真正应该做的是：

- 把编辑态文本测量明确建模为 `draft.layout`
- 把所有 mindmap 临时几何统一收束到 `projected.mindmap`
- 让 commit 与 preview 共享同一份临时布局来源

只有这样，`root/topic` 才会在：

- 编辑态
- 拖拽态
- enter 动画
- commit 后

全部共享同一条几何主轴，不再出现“退出编辑才突然变对”的现象。
