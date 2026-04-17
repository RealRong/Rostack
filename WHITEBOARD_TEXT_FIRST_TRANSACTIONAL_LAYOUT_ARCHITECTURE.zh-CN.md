# Whiteboard Text-First 事务化布局最终重构方案

## 1. 结论

当前 `text` / `mindmap topic` 相关问题之所以反复出现，不是因为局部实现没补全，而是因为底层模型本身不通顺。

现在系统里同时存在三套互相冲突的语义：

- `text.size` 既像 authored 初始值，又像 computed 结果，又被当成 fallback
- `mindmap topic` 名义上是普通 `text`，但创建和 relayout 仍然走树侧的另一套尺寸解释
- create / insert / edit 不是一次性提交最终几何，而是先落一个临时状态，再靠第二次 sync 修正

这会必然导致：

- 新建 root 第一帧高度错误，进入编辑或输入后才恢复
- child topic 初始宽度偏大，进入编辑后才缩回真实宽度
- 不同入口对同一个 topic 的宽高解释不一致

长期最优方案必须改成：

**先算 text layout，再算 tree layout，并且一次性事务提交最终 node size 与 position。**

一句话总结：

**普通 `text` 是唯一文本布局基元，`mindmap topic` 只是被 tree 拥有的 `text node`；bootstrap 只能是兜底，不能是正式语义；create / insert 不允许再走“先错后修”的两段式提交。**

---

## 2. 当前模型为什么必然出错

## 2.1 `text.size` 被混用了

当前 `text.size` 同时扮演了三种角色：

1. schema/default 阶段的初始框
2. runtime layout 的最终测量结果
3. tree / read / sanitize 的 fallback 输入

这三种角色不能放在一个字段里共存。

一旦共存，就会出现：

- 第一帧 `size` 是 bootstrap
- 编辑 draft 又算出真实 `size`
- 非编辑态 relayout 再读回 bootstrap / fallback / clamp 后的另一个值

所以用户看到的就是：

- 新建时错
- 编辑时对
- 退出后又跳

## 2.2 `mindmap topic` 不是完整复用普通 text

虽然 `mindmap topic` 在 document 里是 `type: 'text'`，但实际上它没有完整走普通 text 的同一套生命周期。

当前 topic 的几何仍然被三处共同决定：

- text 自己的 layout
- mindmap 写入阶段的 fallback / bootstrap / 估算尺寸
- mindmap read 阶段的再次解释

只要 topic 尺寸不完全由 text layout 决定，tree 就一定会在某些时刻看到旧值或猜出来的值。

## 2.3 create / insert 仍然是“两段式”

当前很多路径本质上是：

1. 先提交一个合法但不正确的 node
2. 再异步或后续同步一次 layout 结果

这条线最容易在 mindmap 里出问题，因为 mindmap 还会把 topic size 继续拿去排树。

结果就是：

- 第一次 commit 的 topic size 错
- tree 按错的 size 排出来
- 第二次 sync 才修正
- 期间 render / selection / focus / edit 已经吃到了错误状态

只要还是两段式，这类 bug 会不断复现。

---

## 3. 最终目标

重构后的系统必须满足以下目标：

1. `text.size` 只表示最终外框尺寸。
2. `text` 的最终尺寸只能由 text layout 产出。
3. `mindmap` 不再猜 topic 尺寸，只消费已确定的 topic size。
4. create / insert / text commit 必须一次性提交最终几何。
5. bootstrap size 只能是兜底容错，不进入正常交互主路径。
6. edit draft 与 display committed 必须共享同一套尺寸语义。

---

## 4. 最终语义

## 4.1 普通 `text`

普通 `text` 是唯一文本布局基元。

authoring inputs：

- `data.text`
- `data.widthMode`
- `data.wrapWidth`
- `style.fontSize`
- `style.fontWeight`
- `style.fontStyle`
- `style.paddingX`
- `style.paddingY`
- `style.strokeWidth`
- `style.frameKind`
- `style.minWidth`
- `style.maxWidth`
- `position`
- `rotation`

computed output：

- `size`

固定语义：

```ts
type TextSize = {
  width: number
  height: number
}
```

并且：

- `size.width` 是最终外框宽度
- `size.height` 是最终外框高度
- `wrapWidth` 表示最终外框宽度，不是内容盒宽度

## 4.2 `mindmap topic`

`mindmap topic` 的本质定义必须收死为：

- 它是一个真实 `text node`
- 它的 `size` 完全由 text layout 决定
- 它的 `position` 完全由 tree layout 决定

所以 topic 只有一条合法数据流：

```ts
topic authored text/style
  -> text layout
  -> topic size
  -> tree layout
  -> topic position
```

绝不能出现第二条旁路：

```ts
topic data/style
  -> fallback/bootstrap/template/estimate
  -> guessed topic size
  -> tree layout
```

## 4.3 `mindmap` 自身

`mindmap` 本身不拥有 topic 尺寸语义。

它只拥有：

- tree topology
- branch style
- tree layout spec
- root anchor / tree position

它的职责仅限于：

- 给定每个 topic 的 final size
- 计算每个 topic 的 final position

---

## 5. 必须删除的错误语义

## 5.1 `applyNodeDefaults` 不再给 text 写正式 `size`

这是第一条必须改的。

`applyNodeDefaults` 只能做 authored defaults：

- `defaultData`
- schema field defaults

它不能再把 `resolveNodeBootstrapSize()` 的结果写成 `text.size`。

原因很简单：

- bootstrap 不是 layout result
- bootstrap 不是用户语义
- bootstrap 不是稳定几何

一旦把它写进正式 `size`，后面所有 read / render / selection / tree layout 都会把它当真

所以最终规则必须是：

- `text.size` 缺失是允许的中间状态
- `text.size` 只有在 layout 完成后才会写入

## 5.2 topic 不再继承 template 的 layout state

新 child topic 只能继承 visual style，不能继承任何布局状态。

允许继承：

- `stroke`
- `strokeWidth`
- `fill`
- `padding`
- `frameKind`
- `minWidth`
- `maxWidth`
- typography style

禁止继承：

- `size`
- `data.widthMode`
- `data.wrapWidth`

因为这三者不是主题风格，而是具体实例的布局结果或布局偏好。

## 5.3 tree layout 不再估算 topic size

mindmap write/read 两侧都不应再做这些事：

- `fontSize * 1.4` 估高
- `Math.max(size.width, minWidth)` 二次解释
- `fallback.width = config.mindmapNodeSize.width`
- 基于 `node.size ?? bootstrap ?? fallback` 去猜 topic box

这些都属于 text layout 职责，不属于 tree layout 职责。

---

## 6. 最终的数据流

## 6.1 普通 `text.create`

最终必须改成：

```ts
authored node input
  -> resolve text layout input
  -> measure text
  -> attach final size
  -> single create command
```

而不是：

```ts
authored node input
  -> apply defaults + bootstrap size
  -> create command
  -> later layout sync
```

## 6.2 `mindmap.create`

最终必须改成：

```ts
materialize tree + topic authored inputs
  -> measure every topic text size
  -> run tree layout using measured sizes
  -> single transaction commit:
     - mindmap container
     - topic nodes with final size
     - topic positions
```

这样 root 第一帧就已经是正确高度，child 第一帧就已经是正确宽度。

## 6.3 `mindmap.insert`

最终必须改成：

```ts
build new topic authored input
  -> measure new topic size
  -> recompute whole tree layout
  -> single transaction commit:
     - create new topic
     - update positions of affected topics
```

不允许：

- 先 create 一个 bootstrap child
- 再 sync child size
- 再 relayout tree

这条路径就是当前 child topic 问题的根因。

## 6.4 `text edit commit`

普通 text 与 mindmap topic 的文本提交都应完全一致：

```ts
draft text
  -> measure draft size
  -> commit text + final size in one update
```

对于 mindmap topic，多一步：

```ts
draft text
  -> measure draft topic size
  -> recompute tree layout
  -> commit topic text + topic size + affected positions in one transaction
```

---

## 7. Editor 中轴必须如何重构

editor 必须成为唯一的布局事务编排器。

最终 editor 应该提供两类能力。

## 7.1 纯测量

```ts
measureText(input: TextLayoutInput): Size
measureFit(input: FitLayoutInput): number
```

只负责计算，不写 document。

## 7.2 事务化提交编排

```ts
createTextNode(input): CommandResult
createMindmap(input): CommandResult
insertMindmapTopic(input): CommandResult
commitNodeText(input): CommandResult
```

这些 API 的共同点必须是：

- 在进入 engine 之前，最终几何已经确定
- 进入 engine 后只做单次提交

也就是说，`layout.sync` 不该再是主业务路径的一部分。

它最终只能保留为：

- 文档恢复
- 外部导入校正
- 极少数显式 repair 工具

而不是 create / insert / edit 的常规实现。

---

## 8. Engine / Write 层应该如何收口

engine/write 层应该只接收两类信息：

- authored fields
- editor 已经算好的 computed fields

write 层不再承担 text layout 推断职责。

对于 mindmap：

- write 层接受完整的 tree patch
- 以及完整的 topic node create/update payload

它不再在 translate 阶段做 topic size 猜测。

这样 write 层的职责会变得非常清晰：

- 验证
- 归并
- 一次性提交

而不是：

- 一边创建 topic
- 一边猜 topic 宽高
- 一边 relayout tree

---

## 9. React 层应该如何简化

React 只保留平台测量 backend，不再影响业务时序。

最终职责：

- 提供稳定 typography source
- 提供测量实现
- 提供文本渲染 host

明确不再让 React 决定：

- 何时对 node 写回 `size`
- create 后是否再 sync
- source host mount 是否触发 geometry patch

尤其是：

**测量 backend 不能依赖“该节点自己的 DOM host 已经挂载”。**

否则 create / insert 永远只能先落 bootstrap，再等第二次 patch。

所以 backend 必须支持：

- 没有具体 node DOM 也能量
- 使用全局稳定 typography source 做测量

---

## 10. 最小最终 API

推荐保留的最小接口如下。

## 10.1 Core

```ts
type TextLayoutInput = {
  text: string
  widthMode: 'auto' | 'wrap'
  wrapWidth?: number
  fontSize: number
  fontWeight?: number | string
  fontStyle?: string
  frame: TextFrameInsets
  minWidth?: number
  maxWidth?: number
}

type TextLayoutResult = {
  size: Size
}

readTextLayoutInput(node): TextLayoutInput | undefined
buildTextLayoutPatch(result): NodeUpdateInput
```

注意：

- 不再在 core 暴露 bootstrap 为主流程 API
- bootstrap 只作为 repair/fallback 的独立 helper

## 10.2 Editor

```ts
type LayoutService = {
  measureText(input: TextLayoutInput): Size
  measureFit(input: FitLayoutInput): number
}

type LayoutTransactions = {
  createText(input): CommandResult
  createMindmap(input): CommandResult
  insertMindmapTopic(input): CommandResult
  commitNodeText(input): CommandResult
}
```

关键不是名字，而是职责：

- `measure*` 只算
- `create/insert/commit*` 在进入 engine 前已经把最终几何准备好

## 10.3 Engine

engine 不需要 layout service。

它只接受：

- 最终 node create payload
- 最终 node update payload
- 最终 tree patch

---

## 11. 最终事务模型

这是整套方案最核心的一点。

所有 text-affecting 操作都必须满足：

**用户动作只对应一次最终提交。**

包括：

- create text
- create mindmap
- insert child topic
- commit topic text
- 改 wrapWidth
- 改字号后导致 size 改变

都必须在 editor 内先完成：

1. authored state 收集
2. layout 计算
3. tree layout 计算（如果需要）
4. 组装最终 operations

然后一次进入 engine。

不能再出现：

1. 先 create
2. 再 sync size
3. 再 relayout tree

这种两段式提交就是当前 bug 的总源头。

---

## 12. 为什么这套模型 bug 最少

因为它消掉了三个最危险的歧义：

1. `text.size` 不再同时表示 bootstrap 和 final result
2. `mindmap` 不再拥有 topic size 的第二套解释权
3. create / insert 不再拆成“先错后修”两次提交

只要这三条成立，当前这类 bug 会自然消失：

- root 新建首帧高度错误
- child 初始宽度错误
- 进入编辑态才恢复正常
- 非编辑态与编辑态宽高不一致

---

## 13. 实施顺序

建议按以下顺序重构。

### 阶段 1：剥离 bootstrap 的正式语义

- `applyNodeDefaults` 不再给 `text` 写正式 `size`
- `text.size` 缺失被视为允许的中间态

### 阶段 2：建立 editor 侧的 text-first create/commit

- 普通 `text.create` 改为先测量后提交
- `node.text.commit` 改为始终单次提交最终 `size`

### 阶段 3：重做 mindmap create/insert

- topic 只继承 style
- create / insert 先测 topic size，再排 tree，再一次性提交

### 阶段 4：删掉 tree 侧的 topic size 猜测逻辑

- write 侧删除 fallback/estimate/clamp 解释
- read 侧删除 topic size 的二次推断

---

## 14. 最终裁决

这次重构的最终裁决应该明确写死：

- `text` 是唯一文本布局基元
- `mindmap topic` 不是特殊文本系统，只是 `text + tree-owned position`
- bootstrap 不是正式语义
- `layout.sync` 不是 create / insert / edit 的主路径
- 所有 text-affecting 操作必须先 layout，再单次提交

这是当前复杂度最低、语义最顺、长期 bug 最少的方案。
