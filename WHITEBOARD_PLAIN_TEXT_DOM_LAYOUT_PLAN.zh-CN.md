# Whiteboard Plain Text DOM 布局方案

## 1. 结论

plain `text` 不再按“用户直接编辑 width / height 的 box 节点”建模，但它仍然继续把最终外框尺寸写回 document。

这次采用的唯一方案是：

- plain `text` 的 authored inputs 仍然是：
  - `position`
  - `rotation`
  - `data.text`
  - `style.fontSize`
  - `data.widthMode`
  - `data.wrapWidth`
- plain `text` 的 `size` 继续持久化到 document
- 但对 plain `text` 来说，`size` 的语义改为 `computed outer rect cache`
- DOM 仍然是排版真相
- selection / snap / hit test / toolbar / engine geometry 继续统一消费 `node.size`

这意味着：

- 不引入 engine 级 `runtime.layout` store
- 不引入 `computedRect` 旁路
- 不把 plain `text` 的几何真值拆到 document 之外
- 不再讨论其他版本

一句话总结：

plain `text` 的高度不是 authored geometry，但 plain `text` 的最终外框仍然应该写回 `node.size`，作为全系统统一消费的 computed cache。

---

## 2. 为什么选这条路

如果坚持“text 的 measured rect 不能写回 document”，系统就必须补一条 document 之外的几何真值通道。那会连带引入：

- engine runtime layout store
- projection 层二次合成 geometry
- selection / snap / hit test 读取 runtime rect
- transform preview 与 committed geometry 双轨并行

这套链路并不是做不到，但对当前仓库来说没有必要。原因很直接：

- 现在真正需要 outer rect 依赖排版的，基本只有 plain `text`
- 当前代码已经接近“测量后回写 `size`”这条路
- `computed data` 持久化本身完全合理，尤其是几何缓存、布局结果、索引输入这类数据
- 只要语义定义清楚，document 里保存 computed cache 不会造成架构问题

所以这次直接选最简单、最稳的方案：

- 继续写回 `size`
- 但把 `text.size` 从“用户可直接编辑的 box geometry”改成“layout cache”

---

## 3. 当前代码现状

当前实现已经有一半方向是对的：

- [`whiteboard/packages/whiteboard-core/src/node/text.ts`](whiteboard/packages/whiteboard-core/src/node/text.ts)
  - 已经有 `widthMode` / `wrapWidth` / `fontSize` 语义
- [`whiteboard/packages/whiteboard-react/src/features/node/dom/textMeasure.ts`](whiteboard/packages/whiteboard-react/src/features/node/dom/textMeasure.ts)
  - 已经使用 DOM 做文本测量
- [`whiteboard/packages/whiteboard-react/src/features/node/registry/default/text.tsx`](whiteboard/packages/whiteboard-react/src/features/node/registry/default/text.tsx)
  - 展示态已经会在 render 后测量并 patch `size`
- [`whiteboard/packages/whiteboard-react/src/features/edit/EditableSlot.tsx`](whiteboard/packages/whiteboard-react/src/features/edit/EditableSlot.tsx)
  - 编辑态已经在维护 live measurement
- [`whiteboard/packages/whiteboard-editor/src/editor/facade.ts`](whiteboard/packages/whiteboard-editor/src/editor/facade.ts)
  - edit commit 已经允许把测量结果带入写入
- [`whiteboard/packages/whiteboard-editor/src/command/node/text.ts`](whiteboard/packages/whiteboard-editor/src/command/node/text.ts)
  - text commit / fontSize commit 已经支持附带 `size`

真正的问题不是“写回 size”本身，而是现在系统还没有把语义彻底讲清楚：

- 一方面，plain `text` 已经在依赖 DOM 测量
- 另一方面，transform / rect / editor 心智里还经常把它当成普通 box 节点

结果就会出现：

- 左右 resize 时，拖拽链路还把旧 `height` 当真
- 编辑态和展示态都在量，但语义上像是补丁
- `size.height` 到底是 authored 还是 computed，没有统一口径

这次方案的核心不是改存储位置，而是改语义。

---

## 4. 新语义

## 4.1 Plain Text 的两层数据

plain `text` 节点有两类数据：

### authored inputs

这里不需要先在代码里发明一个公共 `PlainTextLayoutInput` 类型。

当前最简单的做法就是直接使用现有字段：

- `node.position`
- `node.rotation`
- `node.data.text`
- `node.style.fontSize`
- `readTextWidthMode(node)`
- `readTextWrapWidth(node)`

这些值一起决定 plain `text` 的排版输入。

### computed cache

同样不需要为此额外定义一个公共 `PlainTextComputedCache` 类型。

对 plain `text` 来说：

- `node.size.width`
- `node.size.height`

就是最终外框的 computed cache。

也就是：

- `text` / `fontSize` / `widthMode` / `wrapWidth` 决定排版输入
- `size` 是排版输出缓存

## 4.2 `Node.size` 的语义按节点类型区分

这次不追求所有节点都用同一套 `size` 语义。

对不同节点，`size` 的含义可以不同：

- `text`
  - `size` = computed outer rect cache
- `sticky`
  - `size` = authored outer rect
- `shape`
  - `size` = authored outer rect
- `frame`
  - `size` = authored outer rect
- `draw`
  - `size` = authored geometry / 包围盒输入

这是可以接受的。公共层不需要强行统一“所有节点的 `size` 都是 authored”。

## 4.3 plain `text` 的交互语义

plain `text` 固定遵守以下规则：

- `auto`
  - 宽度由内容决定
  - 高度由内容决定
  - 最终 measured size 写回 `node.size`
- `wrap`
  - `wrapWidth` 是 authored input
  - 高度由内容决定
  - 最终 measured size 写回 `node.size`
- 左右 resize
  - 本质是 reflow
  - 修改 `widthMode` / `wrapWidth`
  - 重新测量
  - 写回新的 `size`
- 四角 resize
  - 本质是 scale
  - 修改 `fontSize`
  - 如果起始是 `wrap`，同步修改 `wrapWidth`
  - 重新测量
  - 写回新的 `size`
- 上下 resize
  - 对 plain `text` 永远禁用

最重要的一条：

- `size.height` 永远不是 plain `text` 的 authored height
- 它始终是 DOM 布局后的结果缓存

---

## 5. 设计原则

### 5.1 只有一份外框真值

selection / snap / hit test / toolbar / engine geometry 继续统一读取 `node.size`。

不引入：

- 第二份 runtime rect
- 第三份 React-only rect
- 只有编辑器知道、engine 不知道的 layout cache

### 5.2 DOM 是排版真相，document 是排版缓存

对 plain `text`：

- DOM 负责算“真实应该多宽多高”
- document 负责保存“当前最后一次可信测量结果”

这两者不是冲突关系，而是：

- DOM = source of measurement truth
- document `size` = persisted cache / shared geometry truth

### 5.3 不为一个 `text` 重构整个 engine

既然 `engine.read.node.rect`、`nodeRectIndex`、selection、snap 都已经基于 `node.size` 工作，那最合理的方案就是继续让它们读 `node.size`。

这次不做：

- engine geometry 总线重写
- hit test 数据源替换
- snap 索引旁路
- selection geometry runtime 双轨

---

## 6. API 设计

## 6.1 不新增新的 exported API

按这次选定的方案，没有必要为了 plain `text` 再新增下面这类公共 API：

- `readPlainTextLayoutInput`
- `buildPlainTextLayoutKey`
- `readPlainTextComputedSize`
- `shouldPatchPlainTextComputedSize`
- 公共 `PlainTextLayoutInput` 类型

原因：

- 当前系统已经有足够的现有字段和 helper
- 这些 API 大多只是把现有字段重新包一层名字
- 现在真正需要的是统一语义，不是继续抽象

代码层最简单的做法是：

- 直接读 `node.position`
- 直接读 `node.rotation`
- 直接读 `node.data.text`
- 直接读 `node.style.fontSize`
- 继续复用 `readTextWidthMode(node)`
- 继续复用 `readTextWrapWidth(node)`
- 直接读 `node.size`
- 用现有的 `isSizeEqual` 做去重

## 6.2 继续复用现有 helper

`@whiteboard/core/node/text` 继续复用现有能力：

- `readTextWidthMode`
- `readTextWrapWidth`
- `setTextWidthMode`
- `setTextWrapWidth`

`@whiteboard/react` 继续复用现有 DOM backend：

- [`whiteboard/packages/whiteboard-react/src/features/node/dom/textMeasure.ts`](whiteboard/packages/whiteboard-react/src/features/node/dom/textMeasure.ts)

`@whiteboard/react` 继续复用现有输入整理逻辑：

- [`whiteboard/packages/whiteboard-react/src/features/node/registry/default/text.tsx`](whiteboard/packages/whiteboard-react/src/features/node/registry/default/text.tsx)
  - `resolveTextMeasureInput`

测量这层仍然只回答一件事：

- 当前排版输入下，文本最终外框应该是多少

### 命名清理

这次直接同步做完局部重命名：

- `useSyncedTextNodeSize` -> `useSyncTextComputedSize`
- `liveSize` -> `measuredSize`

重点是只做命名清理，不新增一组公共 reader API。

## 6.3 `@whiteboard/editor` 命令层

这里尽量沿用现有 API，而不是发明新通道。

### 保留现有 text commit 形状

[`whiteboard/packages/whiteboard-editor/src/command/node/types.ts`](whiteboard/packages/whiteboard-editor/src/command/node/types.ts) 里的这两个入口可以继续保留：

```ts
commit(input: {
  nodeId: NodeId
  field: 'text' | 'title'
  value: string
  size?: Size
}): CommandResult | undefined

size(input: {
  nodeIds: readonly NodeId[]
  value?: number
  sizeById?: Readonly<Record<NodeId, Size>>
}): CommandResult
```

只是语义要改清楚：

- `size` / `sizeById` 对 plain `text` 表示 computed cache
- 不是用户手动编辑的 box size

### 编辑态 session

当前的 `EditLayout.measuredSize` 作为编辑中的测量缓存。

```ts
export type EditLayout = {
  baseRect?: Rect
  measuredSize?: Size
  wrapWidth?: number
  composing: boolean
}
```

它的正确语义是：

- 编辑中临时测量结果
- commit 前的 local cache
- 不代表 authored height

这意味着这次不需要先删掉 `measuredSize` 再重造 runtime layout store。

## 6.4 `@whiteboard/core/node/transform`

这里同样不需要重构成另一套 geometry 系统。

沿用现有：

```ts
export type TransformPreviewPatch = {
  id: NodeId
  position?: Point
  size?: Size
  rotation?: number
  fontSize?: number
  mode?: TextWidthMode
  wrapWidth?: number
  handle?: ResizeDirection
}
```

但对 plain `text` 的语义改成：

- `mode` / `wrapWidth` / `fontSize` = preview 的 layout inputs
- `size` = preview 的 computed outer rect
- 不是 preview 的 authored box

这条规则落地后：

- 左右 resize 预览时，`size.height` 必须来自实时测量
- 四角 scale 预览时，`size` 必须来自新字号下的实时测量

## 6.5 `@whiteboard/react` 文本节点渲染

继续保留展示态自动同步 measured size 的逻辑，但把它正式化。

[`whiteboard/packages/whiteboard-react/src/features/node/registry/default/text.tsx`](whiteboard/packages/whiteboard-react/src/features/node/registry/default/text.tsx) 里的同步链路应遵守：

1. 根据当前 `text` / `fontSize` / `widthMode` / `wrapWidth` 生成测量输入
2. 调用 `measureTextNodeSize`
3. 如果 measured size 和当前 `node.size` 不同，则 patch `fields.size`
4. patch 使用 `origin: 'system'`

展示态和编辑态都允许更新 computed cache；唯一要求是：

- 只有尺寸真的变化时才写

---

## 7. 关键读写路径

## 7.1 Create

新建 plain `text` 节点时：

- document 继续带 `size`
- 初始 `size` 使用 bootstrap 值
- React mount 后立刻以真实 DOM 测量覆盖

推荐 bootstrap：

- `auto`
  - `TEXT_START_SIZE`
- `wrap`
  - `width = wrapWidth`
  - `height = TEXT_START_SIZE.height`

这意味着：

- 首帧 geometry 始终存在
- 不需要等 DOM mount 才有 rect

## 7.2 Display

展示态每次以下字段变化时，都要重新测量并同步 `size`：

- `data.text`
- `style.fontSize`
- `data.widthMode`
- `data.wrapWidth`

engine / selection / snap / hit test 仍然只读 `node.size`。

## 7.3 Edit

编辑态链路继续沿用现有模式：

1. `EditableSlot` 在 `input` / `compositionupdate` / `compositionend` 时测量
2. 结果写入 `edit.layout.measuredSize`
3. commit 时把 `measuredSize` 带进 `node.text.commit`
4. command 把新文本与 measured `size` 一起写回 document

这样：

- 编辑态尺寸变化可以实时跟随
- 退出编辑态后不需要额外 runtime 合成 geometry

## 7.4 Resize-X

左右 resize 时：

1. transform 改变 `mode` / `wrapWidth`
2. 文本节点按 preview 输入渲染
3. DOM 重新测量真实高度
4. preview `size` 更新为 measured result
5. commit 时把：
   - `widthMode`
   - `wrapWidth`
   - `size`
   - 必要时 `position`
   一起写回

关键点：

- plain `text` 左右 resize 不是直接改 `height`
- `height` 来自测量结果

## 7.5 Scale-XY

四角 scale 时：

1. transform 改变 `fontSize`
2. 如果起始是 `wrap`，同步调整 `wrapWidth`
3. 文本节点按 preview 输入重新渲染
4. DOM 重新测量
5. preview `size` 更新
6. commit 时把：
   - `fontSize`
   - `wrapWidth`（如果有）
   - `size`
   - `position`
   一起写回

## 7.6 Selection / Snap / Hit Test

这里是这条方案最简单的地方：

- 不改 engine 读取口
- 不改 geometry cache 架构
- 不改单选、多选、snap、marquee 的 rect 来源

因为大家继续统一读 `node.size` 即可。

---

## 8. transform 预览怎么做最简单

如果要实现“拖拽中高度实时变化”，最简单的办法不是新建 runtime layout store，而是继续复用本地 preview patch。

推荐做法：

1. core transform 先给出 preview 的输入变化
   - `mode`
   - `wrapWidth`
   - `fontSize`
2. React 文本节点按这些 preview 输入重新渲染
3. 渲染后的 DOM 立刻测量
4. 将 measured `size` 回写到 text preview patch
5. selection overlay 继续消费 projection 后的 preview `rect`

也就是说，transform 期间有两类 preview：

- input preview
- measured size preview

但它们都停留在现有 preview 通道内，不上升为 engine 全局 runtime geometry。

---

## 9. 性能与一致性

## 9.1 只在变更时写回

展示态、编辑态、transform commit 都必须先比较尺寸是否变化。

如果尺寸没变，不写回 document。

## 9.2 system-origin

纯测量导致的 `size` patch 应尽量标为 `origin: 'system'`。

目标：

- 不污染用户心智
- 尽量避免无意义 undo 噪音

是否完全不进 history，可以后续再定；但至少语义上应和用户主动编辑区分开。

## 9.3 字体环境一致性

既然 `size` 会被持久化，那么不同客户端字体度量差异会变得更显性。

这不是这条方案独有的问题，但需要明确接受：

- 同一份 text 在不同字体 fallback 环境下，measured size 可能略有不同

建议：

- 尽量固定文本字体环境
- 保证字号、line-height、font-weight 的计算规则一致
- 允许最后测量结果覆盖旧 cache

## 9.4 首帧优势

这条方案的一个直接好处是：

- document 里本来就有 `size`
- 大文档加载、协作同步、undo/redo 恢复时，首帧就有 geometry

这比 runtime-only rect 方案简单很多。

---

## 10. 实施方案

## 阶段 1：统一语义，不改大架构

目标：

- 正式把 plain `text.size` 定义成 computed cache

改动：

- 更新 [`whiteboard/packages/whiteboard-core/src/node/text.ts`](whiteboard/packages/whiteboard-core/src/node/text.ts)
  - 不新增新的 exported API
  - 补充注释，明确 `text.size` 的 computed cache 语义
- 更新注释与测试
  - 明确 `text.size` 不是 authored height

## 阶段 2：清理展示态与编辑态测量语义

目标：

- 让现有 measurement 链路“名正言顺”

改动：

- [`whiteboard/packages/whiteboard-react/src/features/node/registry/default/text.tsx`](whiteboard/packages/whiteboard-react/src/features/node/registry/default/text.tsx)
  - 保留展示态测量回写
  - 明确这是同步 computed cache
- [`whiteboard/packages/whiteboard-react/src/features/edit/EditableSlot.tsx`](whiteboard/packages/whiteboard-react/src/features/edit/EditableSlot.tsx)
  - 保留编辑态 `measuredSize`
  - 明确这是 measured cache
- [`whiteboard/packages/whiteboard-editor/src/editor/facade.ts`](whiteboard/packages/whiteboard-editor/src/editor/facade.ts)
  - 保留 commit 带 `size`

## 阶段 3：把 transform 改成“输入预览 + measured size 预览”

目标：

- 解决拖拽时高度冻结

改动：

- [`whiteboard/packages/whiteboard-core/src/node/transform.ts`](whiteboard/packages/whiteboard-core/src/node/transform.ts)
  - 保留 `TransformPreviewPatch`
  - 明确 text 的 `size` 是 computed preview
- [`whiteboard/packages/whiteboard-editor/src/input/transform/session.ts`](whiteboard/packages/whiteboard-editor/src/input/transform/session.ts)
  - 继续走 preview patch
- [`whiteboard/packages/whiteboard-editor/src/local/feedback/node.ts`](whiteboard/packages/whiteboard-editor/src/local/feedback/node.ts)
  - 允许 text preview patch 同时持有输入预览与 measured size 预览
- [`whiteboard/packages/whiteboard-react/src/features/node/registry/default/text.tsx`](whiteboard/packages/whiteboard-react/src/features/node/registry/default/text.tsx)
  - 预览态测量后写回 preview `size`

## 阶段 4：命名清理

目标：

- 降低误读概率

已落地改动：

- `useSyncedTextNodeSize` -> `useSyncTextComputedSize`
- `liveSize` -> `measuredSize`

---

## 11. 明确不做的事情

这次明确不做：

- 不引入 engine runtime layout store
- 不把 geometry 真值移出 document
- 不为 plain `text` 发明第二套全局 rect 查询口
- 不把 selection / snap / hit test 改成读 runtime rect
- 不删除 persisted `size`

---

## 12. 验收标准

做到以下行为，才算方案落地：

- plain `text` 的 `size` 在文档层被明确视为 computed cache
- 编辑文本内容后，新的 measured size 会稳定写回 document
- 展示态、编辑态、selection、snap、hit test 统一读取同一份 `node.size`
- 左右 resize 时高度实时跟随排版变化，不再冻结
- 四角 scale 时字号变化与 measured size 一起提交
- 上下 resize 永远不可用
- 首帧加载不依赖 DOM mount 才能得到 rect
- 不引入第二套 runtime rect 通道

---

## 13. 一句话总结

plain `text` 的最简正确方案不是把 computed geometry 从 document 里赶出去，而是承认：

- authored inputs 负责描述排版条件
- DOM 负责测量
- `node.size` 负责保存最终外框缓存

只要全系统统一消费这份 `size`，并且不再把 `text.size.height` 误解为 authored height，plain `text` 的 edit、resize、scale、selection、snap 就能收敛在一条最简单的链路上。
