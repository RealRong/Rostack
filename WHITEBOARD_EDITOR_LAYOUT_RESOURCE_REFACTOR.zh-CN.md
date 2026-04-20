# Whiteboard Editor Layout Resource Refactor

本文定义 `whiteboard-editor` 中本地布局资源的重构方式，重点覆盖：

- `edge label metrics`
- 其他同类的本地派生资源

本文不讨论写入主轴，不重复 `write api` / `reducer` 设计，只定义：

- 哪些东西应该迁移
- 迁移后的最终 API
- 哪些旧职责必须删除
- 分阶段如何落地

相关文件：

- [`whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts)
- [`whiteboard/packages/whiteboard-editor/src/query/edge/read.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/query/edge/read.ts)
- [`whiteboard/packages/whiteboard-editor/src/write/edge/label.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/write/edge/label.ts)
- [`whiteboard/packages/whiteboard-editor/src/action/index.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/action/index.ts)
- [`whiteboard/packages/whiteboard-editor/src/input/features/edge/label.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/edge/label.ts)
- [`whiteboard/packages/whiteboard-editor/src/layout/runtime.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/layout/runtime.ts)

---

## 1. 目标

长期最优下，`edge label` 以及其他类似能力必须满足：

- 正确性不依赖 `createEditor` 启动预热
- 正确性不依赖 `write` / `action` / `input` 主动塞 cache
- `query` 自己闭合，读视图时能直接得到结果
- 本地测量结果不进入 document / session / operation
- `remote apply`、`undo`、`redo`、`document.replace` 都自动正确

约束：

- `edge label` 继续使用粗测即可
- 不需要引入 DOM 精测
- 不需要把 `edge label` 纳入写入线或 reducer

---

## 2. 当前问题

当前 `edge label` 链路的复杂度主要来自“手动预热 cache”：

- `createEditor` 在启动时扫全量 committed edge 并执行一次预热
- `query.edge.label.metrics` 只读 cache，拿不到就返回 `undefined`
- `write.edge.label.*` 在写入前手动 `ensure`
- `actions.edit.startEdgeLabel` / `actions.edit.input` 在编辑时手动 `ensure`
- edge label drag 在读取不到 metrics 时再 fallback `ensure`

这会带来几个直接问题：

- `createEditor` 从组合器变成了派生状态编排器
- `query.edge.read` 不是自洽的读模型
- `write` / `action` / `input` 都在帮 query 维持局部正确性
- 同一类 cache 在多个入口重复维护
- 正确性依赖调用顺序，而不是依赖底层模型

这类问题的本质不是测量精度，而是职责放错层了。

---

## 3. 最终分类

`editor` 内所有“非持久化、环境相关、仅供本地读视图使用”的东西，长期最优下统一分成两类：

## 3.1 同步 memoized resource

适用于：

- 输入是显式 key
- 结果可同步计算
- 不需要写入 document
- 不需要进入 session
- 不需要通过 commit 才生效

典型例子：

- `edge label` 的文本粗测尺寸
- 未来其他 label / badge / overlay 的文本粗测尺寸

这类能力的最终模型是：

- 按 key 同步计算
- 按 key 本地 memoize
- query 读取时直接调用
- `prime` 只能做性能优化，不能承担正确性职责

## 3.2 projected layout read

适用于：

- 结果依赖 document + session + preview
- 本身就是一个投影视图
- 需要跟随订阅关系重算

典型例子：

- `mindmap` live layout
- enter preview / root move preview
- 未来其他动画化或 preview 化布局

这类能力继续放在 `layout.*Read`，保持 store/read model 形态。

---

## 4. `edge label` 的最终模型

`edge label metrics` 长期最优下不应该是：

- `read(spec)` + `ensure(spec)` 双接口
- editor 启动预热
- 写入前预热
- 编辑时预热
- 输入层 fallback 预热

长期最优下，它应该是一个同步 memoized resource：

```ts
type TextMetricsSpec = {
  profile: TextTypographyProfile
  text: string
  placeholder: string
  fontSize: number
  fontWeight?: number | string
  fontStyle?: string
}

type TextMetrics = Size

type TextMetricsResource = {
  measure(spec: TextMetricsSpec): TextMetrics
  prime(specs: readonly TextMetricsSpec[]): void
  clear(): void
}
```

约束：

- `measure(spec)` 必须同步返回结果
- `measure(spec)` 内部负责 memoize
- `prime(specs)` 只允许做批量预填充
- 所有调用方都必须假设“即使没 prime 也完全正确”
- `clear()` 只用于字体环境变化或 editor dispose，不参与正常写入线

---

## 5. `EditorLayout` 最终接口

```ts
type EditorLayout = {
  text: TextMetricsResource
  mindmap: MindmapLayoutRead

  patchNodeCreatePayload(payload: NodeInput): NodeInput
  patchMindmapTemplate(
    template: MindmapTemplate,
    position?: Point
  ): MindmapTemplate
  patchNodeUpdate(
    nodeId: NodeId,
    update: NodeUpdateInput,
    options?: { origin?: Origin }
  ): NodeUpdateInput
  editNode(input: {
    nodeId: NodeId
    field: EditField
    text: string
  }): Partial<EditLayout> | undefined
  resolvePreviewPatches(
    patches: readonly TransformPreviewPatch[]
  ): readonly TransformPreviewPatch[]
}
```

要求：

- `layout.text` 只提供同步测量资源
- 不再暴露 `read` / `ensure` / `ensureMany`
- `layout.mindmap` 继续保持 projected read，不与 `text` 资源模型混合

---

## 6. `query.edge` 的最终职责

`query.edge.label` 必须自己闭合。

最终依赖链路固定为：

1. `label.content(ref)`
2. `label.metrics(ref)`
3. `label.placement(ref)`
4. `label.render(ref)`

其中：

- `label.content(ref)` 负责产出 `TextMetricsSpec`
- `label.metrics(ref)` 负责调用 `layout.text.measure(spec)`
- `label.placement(ref)` 只负责几何放置
- `label.render(ref)` 只负责拼最终渲染数据

可以写成：

```ts
type EdgeLabelContent = {
  ref: EdgeLabelRef
  text: string
  displayText: string
  style: EdgeLabelStyle | undefined
  editable: boolean
  caret?: EditCaret
  textMode: EdgeTextMode
  t: number
  offset: number
  metricsSpec: TextMetricsSpec
}
```

要求：

- `metricsSpec` 由 `content` 统一提供
- `metrics(ref)` 不再依赖外部预热
- `metrics(ref)` 不得返回“因为没人 ensure 过所以是 `undefined`”

`edge label` 的本地正确性必须由 `query + layout.text.measure` 自己保证。

---

## 7. 需要删除的旧职责

以下职责必须删除：

## 7.1 `createEditor`

删除：

- 启动时扫全量 edge label 并预热 metrics

保留：

- 只负责组装 `session` / `layout` / `query` / `write` / `actions` / `host`

## 7.2 `write.edge.label`

删除：

- 为了预热 metrics 而投影 label patch
- 为了预热 metrics 而读取当前 label 并做一次本地模拟

保留：

- 只负责 `engine.execute(...)`

## 7.3 `actions.edit`

删除：

- `startEdgeLabel` 里的 metrics 预热
- `edit.input` 针对 edge label 的 metrics 预热

保留：

- 只维护 edit session
- commit / cancel 时只决定语义写入

## 7.4 `input/features/edge/label`

删除：

- drag 前因为读不到 metrics 而 fallback `ensure`

保留：

- 只读取 `query.edge.label.metrics(ref)`
- 只做交互投影与提交

---

## 8. 测量实现约束

`edge label` 继续沿用粗测模型。

建议保留当前这些原则：

- 用 `profile + text + placeholder + fontSize + fontWeight + fontStyle` 作为 key
- 用 canvas 粗测宽度
- 高度用 `lineHeight ratio * fontSize`
- `tangent` 模式继续在 placement size 阶段修正高度

要求：

- 不把 React DOM source 引入 `edge label` 这条线
- 不要求拿到真实 DOM 才能渲染 label
- `edge label` 的测量目标是稳定、便宜、足够一致，而不是像 node text 那样追求排版精度

---

## 9. 与其他能力的边界

不是所有文本相关能力都应该迁到 `TextMetricsResource`。

以下能力保留现状：

- node text `size` layout
- sticky `fit` layout
- 任何会反向影响 document geometry 的精确测量

原因：

- 这些结果会影响写入语义
- 这些结果本来就属于 `layout backend`
- 它们不是单纯的“本地只读资源”

`edge label metrics` 与这些能力的边界必须明确：

- `edge label metrics` 只影响本地渲染 placement / mask
- 不影响 reducer
- 不影响 operation
- 不影响 document normalize

---

## 10. 同类迁移规则

未来如果出现类似能力，按下面规则处理：

## 10.1 满足以下条件，则做成同步 memoized resource

- 结果不持久化
- 结果不写入 session
- 结果可按 key 同步计算
- query 在读视图时就能直接得到结果

典型候选：

- shape label 粗测尺寸
- frame title overlay 粗测尺寸
- port label / badge 文本粗测尺寸

## 10.2 满足以下条件，则做成 projected read

- 结果依赖 preview / animation / interaction
- 结果需要随订阅自动刷新
- 结果本身就是一个局部布局视图

典型候选：

- live preview 布局
- 动画过渡布局
- hover / selection chrome 几何投影

## 10.3 不满足以上两类，则不要强行塞进 `layout`

如果一个能力：

- 会影响 document 语义
- 需要进入 command -> operation
- 需要 reducer 才成立

那它属于写入线，不属于本地布局资源。

---

## 11. 最终模块建议

长期最优下，建议把这部分收敛成：

- `whiteboard/packages/whiteboard-editor/src/layout/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/layout/textMetrics.ts`
- `whiteboard/packages/whiteboard-editor/src/edge/label.ts`
- `whiteboard/packages/whiteboard-editor/src/query/edge/read.ts`

职责：

- `layout/textMetrics.ts`
  - `TextMetricsResource`
  - key normalize
  - memoize
  - `measure`
  - `prime`
  - `clear`
- `edge/label.ts`
  - `readEdgeLabelText`
  - `readEdgeLabelDisplayText`
  - `buildEdgeLabelTextMetricsSpec`
- `query/edge/read.ts`
  - `content -> metrics -> placement -> render`
- `layout/runtime.ts`
  - 组装 `text` resource
  - 组装 `mindmap` read
  - 保留 node layout patch API

---

## 12. 分阶段实施方案

## 阶段 1

先把 `layout.text` 从：

- `read`
- `ensure`
- `ensureMany`

改成：

- `measure`
- `prime`
- `clear`

要求：

- `measure` 立即可替代当前 `ensure`
- 调用方不再区分“读 cache”还是“强制计算”

## 阶段 2

重写 `query.edge.label.metrics(ref)`：

- 改为读取 `label.content(ref)` 里的 `metricsSpec`
- 直接调用 `layout.text.measure(metricsSpec)`

要求：

- `query.edge.label.metrics(ref)` 自己闭合
- 不再依赖任何预热顺序

## 阶段 3

删除散落在外部的 metrics 维护逻辑：

- `createEditor` 预热
- `write.edge.label` 预热
- `actions.edit.startEdgeLabel` 预热
- `actions.edit.input` 预热
- drag fallback 预热

## 阶段 4

清理辅助代码：

- 删除 `listEdgeLabelTextMetricsSpecs`
- 删除为预热而存在的 label 投影辅助函数
- 收窄 `write.edge.label` 到纯 command facade

## 阶段 5

把这一套规则推广到其他同类文本 overlay。

要求：

- 一律不要再引入 `prewarmCommitted*`
- 一律不要在 action / input / write 里补局部 cache

---

## 13. 完成后的验收标准

满足以下条件才算完成：

- 删除 `prewarmCommittedEdgeLabelMetrics`
- `query.edge.label.metrics(ref)` 不再因为未预热而返回空
- `write.edge.label.*` 不再做本地 metrics 投影
- `actions.edit.*` 不再做 edge label metrics 维护
- `input/features/edge/label` 不再 fallback `ensure`
- `remote apply` 后首次读取 edge label 也能直接得到 render
- `undo` / `redo` / `document.replace` 后无需额外预热

---

## 14. 最终原则

长期最优下，`edge label metrics` 的原则只有一句话：

不要把“按需可算的本地派生资源”做成“需要外部各层提前配合维护的 cache”。

`edge label` 的正确性应来自：

- `query` 负责读模型闭合
- `layout` 负责同步测量资源

而不是来自：

- editor 启动预热
- write 前预热
- action 时预热
- input fallback 预热
