# Whiteboard Text Layout / Write 职责收口与最终架构方案

## 目标

本文档只解决以下问题：

- 为什么 `whiteboard/packages/whiteboard-editor/src/layout/textLayout.ts` 里还需要 `patchNodeCreateByTextMeasure`
- 这类“文本测量驱动的持久化 patch”职责到底应该归谁
- 为什么 `editor` 层现在会出现大量 `readXxx` helper，以及哪些属于合理 helper，哪些属于架构残留
- `editor`、`editor-scene`、`mutation/core`、`layout backend` 的长期最优职责边界是什么
- 后续如果重构，这一块应该如何一步到位收口

本文档不讨论 projection phase、render patch 粒度、delta to projection 接缝，只聚焦：

- text layout
- write/commit
- editor helper 职责
- runtime measure/query 职责

---

## 一、当前现状

### 1. 当前存在两条同时消费 layout measure 的链路

`createEditor(...)` 当前会先构造：

- `createEditorTextLayout({ nodes, backend })`

并得到一个 `textLayout.measure`，然后同时传给：

- `editor-scene runtime`
- `editor write`
- `editor input host`

也就是：

1. `editor-scene` 使用 measure 参与 projection/runtime 读取
2. `editor` 的 write/input 也直接使用 measure 做持久化前 patch 与 preview patch

这说明当前 measure 已经是一个共享服务，但“谁负责基于 measure 决定 document 最终写入字段”并没有下沉，仍然留在 editor 层。

### 2. `textLayout.ts` 当前混合了三类职责

`whiteboard/packages/whiteboard-editor/src/layout/textLayout.ts` 现在同时做了三件事：

1. 布局策略翻译
   - 例如 `readLayoutKind`
   - 例如 `buildLayoutRequest`
   - 例如根据 node spec、node data/style 把语义对象翻译成 layout backend request

2. 持久化前 patch 生成
   - `patchNodeCreateByTextMeasure`
   - `patchNodeUpdateByTextMeasure`
   - `patchMindmapTemplateByTextMeasure`

3. 交互期 preview patch 生成
   - `patchNodePreviewByTextMeasure`

这三类职责属于不同层级，长期不应该继续揉在一个文件里。

### 3. `editor write` 当前在替底层做 commit normalize

当前以下 write 路径会在 `engine.execute(...)` 之前主动做文本测量 patch：

- `node.create`
- `node.update`
- `mindmap.create`
- `mindmap.topic.insert`

也就是说：

- 用户表达的是语义 intent
- editor write 把 intent 扩写成包含 `size` / `fontSize` 的最终 document patch
- engine/mutation 只接收已经被 editor 预处理过的结果

这本质上是 editor 在替 mutation/core 做“提交前归一化”。

### 4. 当前行为被测试明确锁定

现有测试已经把以下行为定成 contract：

- 文本 node 在 create commit 前完成测量并写入 `size`
- sticky auto font 在 create commit 前完成测量并写入 `style.fontSize`
- mindmap root / inserted child 在提交前完成文本布局补全

所以 `patchNodeCreateByTextMeasure` 现在不是偶然残留，而是当前系统必需逻辑，只是职责放错了层。

---

## 二、为什么现在还需要 `patchNodeCreateByTextMeasure`

### 1. 根因不是 editor 需要它，而是底层还没接管这件事

`patchNodeCreateByTextMeasure` 现在存在，只是因为：

- 某些 node 的持久化字段并不是用户显式输入
- 它们需要由文本测量结果派生
- 但 mutation/core 当前不会自动完成这一步
- document 又要求 commit 后立刻拿到最终可用的 `size` / `fontSize`

因此 editor 只能在调用 `engine.execute(...)` 之前先补一层 patch。

### 2. 当前被补出来的是“持久化字段”，不是“纯渲染字段”

`patchNodeCreateByTextMeasure` 处理的不是 projection-only 字段，而是 document 里会真实落盘、参与：

- history
- inverse
- delta
- sync
- selection / layout 依赖
- 后续 op 读取

的 committed data。

所以这不是 UI 小技巧，而是 mutation 语义的一部分。

### 3. 因此它不应长期留在 editor 层

凡是决定 committed document 最终长什么样的逻辑，都不应该长期挂在 editor facade 上。

`editor.write.node.create(...)` 的长期最优职责应该只是：

- 接收用户 intent
- 发给 engine

而不是：

- 读 document
- 读 projection rect
- 读 node spec
- 调 text measure
- 生成最终 patch
- 再提交

---

## 三、最终职责归属

## 1. layout backend / measure service

### 最终职责

- 提供纯测量能力
- 不拥有 document 写入职责
- 不拥有 projection patch 职责
- 不拥有 op 归一化职责

### 最终形态

它只是一个 service，例如：

- `measure(layoutRequest) -> layoutResult`

或者更上层一点：

- `layout.measureNode(...)`
- `layout.measureEdgeLabel(...)`

但它本身不决定“测量结果写回 document 的哪个字段”。

### 结论

measure 是基础设施，不属于 editor，也不属于 scene，本质上是被多个层复用的服务。

---

## 2. mutation / core

### 最终职责

mutation/core 必须拥有以下职责：

- 定义哪些 op 会触发布局归一化
- 定义布局归一化前需要读取哪些 committed input
- 调用 layout service
- 生成最终 committed patch/op
- 生成对应 inverse / history / delta

### 这层应该接管的内容

以下逻辑都应该从 editor 下沉到 mutation/core：

- `patchNodeCreateByTextMeasure`
- `patchNodeUpdateByTextMeasure`
- `patchMindmapTemplateByTextMeasure`
- `patchMindmapInsertInput`
- sticky auto font 的 `fontMode -> fixed` 归一化
- layout-affecting 字段判定
- “create/update 前需要测量哪些 node”的规则

### 为什么必须下沉到这里

因为它们影响的是 committed document，而 committed document 的唯一权威层必须是 mutation/core。

如果继续放在 editor 层，会带来以下长期问题：

1. 语义漂移
   - 同一个 op 从不同入口进入时，可能被不同上层 patch

2. history / inverse 不透明
   - 底层看不到补出的字段来自什么规则

3. dataview / whiteboard / future runtime 不统一
   - 每个上层都可能重写一遍“提交前 normalize”

4. 远端/脚本/批量导入接口不一致
   - 不经过 editor facade 的写入路径可能丢失 layout normalize

### 最终结论

所有“测量驱动的 committed patch”都必须归 mutation/core。

---

## 3. editor-scene

### 最终职责

editor-scene 只负责：

- query
- projection
- runtime geometry
- render/hit/spatial/read model
- transient preview 相关的最终视图计算

### 它可以继续持有 measure，但仅限读模型用途

例如：

- edge label runtime size
- edit session 文本显示尺寸
- preview geometry
- live scene relayout

这些都属于 projection/runtime 问题，可以留在 scene。

### 它不该负责什么

- 不负责 committed document patch 生成
- 不负责 create/update op normalize
- 不负责把测量结果写回 document
- 不负责 history/inverse 语义

### 结论

`editor-scene` 拿到 measure 并不怪，怪的是当前 mutation 没接管 committed normalize，导致 editor 也要拿 measure 做写前 patch。

---

## 4. editor

### 最终职责

editor 层应只负责：

- 用户交互
- tool/session/selection state
- action/input orchestration
- 调用 engine / scene query
- preview state 组织

### editor 中允许保留的 layout 逻辑

仅允许保留 transient / interaction 相关布局逻辑，例如：

- transform preview 时根据临时 rect 重新计算 text preview
- edit session 中的局部临时视觉反馈

也就是：

- 不写 committed document
- 不定义持久化 patch 规则
- 只为交互中间态服务

### editor 中不应再保留的 layout 逻辑

- create/update 前补 committed size/fontSize
- mindmap create/topic insert 的文本布局 patch
- sticky auto font 的提交归一化
- layout-affecting 字段解析规则

这些都必须迁到 mutation/core。

---

## 四、`readXxx` helper 为什么会显得很怪

## 1. 不是所有 `readXxx` helper 都是问题

需要分三类看。

### A. 合理 helper

这类 helper 只是本地纯函数或 selector，长期可以保留：

- 从 session/state 中读当前值
- 小型结构转换
- 与模块局部实现强绑定的纯算法

例如：

- pointer/session 内部的轻量读取器
- selection/policy 层的局部 selector
- scene 内部 spatial/query 辅助函数

这类问题不大。

### B. 架构残留型 helper

这类 helper 名义上是 `read`，实质上是在上层重建领域语义，长期不该留在 editor：

- `readMindmapTreeView`
- 各种 `readEditableEdgeView`
- `textLayout.ts` 里的 `readLayoutKind + buildLayoutRequest`
- editor 层围绕 committed data / projection / spec / measure 手动拼装的语义计算

这类 helper 暴露的是一个信号：

- 下层本应提供正式能力
- 但现在没提供
- 于是 editor 只能自己拼

### C. 命名误导型 helper

有些 `readXxx` 并不是简单 getter，而是在做：

- normalization
- selection policy derivation
- preview assembly
- domain-specific view construction

这类 helper 不一定全错，但命名会掩盖它们真实复杂度，造成边界继续模糊。

---

## 2. 当前 editor 层 helper 怪的真正原因

不是因为名字叫 `read`。

真正的问题是：

- editor 不应该同时知道 committed document、projection rect、node spec、layout backend 这些底层细节
- 但现在它为了完成 write 前 normalize 与某些交互决策，不得不自己拼这些依赖

所以“helper 很多”只是表象。

本质问题是：

- 下层职责没有收口
- 上层被迫补语义

---

## 五、最终架构决策

## 决策 1：持久化布局归一化归 mutation/core

明确规定：

- 所有 create/update/insert 过程中由文本测量驱动的 committed 字段补全，都归 mutation/core

包括但不限于：

- text node `size`
- sticky auto font `style.fontSize`
- sticky manual size / font mode 归一化
- mindmap root/topic create 的文本布局补全

## 决策 2：preview layout 归 editor / scene

明确规定：

- 只影响 transient preview 的布局 patch 仍然留在 editor 或 scene
- 但不得写 committed document

例如：

- transform preview
- edit overlay preview
- drag/resize 过程中的临时文本重排

## 决策 3：measure 是 service，不是 editor-scene 专属能力

明确规定：

- measure 是共享基础服务
- scene 可以消费它
- mutation/core 也必须可以消费它
- editor 不应该再自行组织 committed normalize

## 决策 4：editor write 只发 intent，不做语义扩写

最终 `editor.write.*` 应该收缩成：

- 参数整理
- 调用 `engine.execute(...)`

不再负责：

- patch committed input
- 读取 projection geometry 决定 document 最终字段
- 依据 node spec 生成布局 patch

## 决策 5：editor 中的领域 helper 要么下沉，要么升格为正式 query/service

规则如下：

- 若 helper 影响 committed write，必须下沉到 mutation/core
- 若 helper 影响 runtime read model，必须下沉到 scene/query/projection
- 若 helper 只是 editor 本地交互细节，可保留
- 若 helper 被多个 feature 重复依赖，应升格为正式 API，而不是继续堆在 editor 下的 `readXxx`

---

## 六、`textLayout.ts` 的最终拆分方向

当前 `textLayout.ts` 不应继续作为长期最终模块存在。

### 应拆成三块

### 1. layout service adapter

职责：

- node spec -> layout request
- edge label -> layout request
- 调 layout backend
- 返回 layout result

这一层是纯布局服务适配层。

### 2. mutation layout normalize

职责：

- create/update/insert 的 committed normalize
- layout-affecting change 判定
- sticky font mode normalize
- inverse/history/delta 视角下的最终 patch 生成

这一层属于 mutation/core。

### 3. preview layout patch

职责：

- transient transform preview
- runtime draft/preview patch

这一层属于 editor 或 scene。

### 最终原则

同一个文件里不能再同时混放：

- backend request build
- committed patch build
- preview patch build

---

## 七、最终 API 方向

本文档不要求立刻确定完整代码签名，但职责上必须明确到以下程度。

## 1. mutation/core 对 layout 的依赖方式

最终不应由 editor 先 patch 再发 op，而应由 mutation/core 在处理 op 时内部调用 layout service。

最终方向应类似：

```ts
new MutationEngine({
  document,
  services: {
    layout
  },
  operations,
  compile
})
```

其中：

- `layout` 是共享 service
- `operations/compile` 内部决定何时测量、如何写回 committed patch

## 2. editor write 的最终接口

最终应类似：

```ts
editor.write.node.create({
  position,
  template
})
```

它只表达 intent，不再自行 patch `size/fontSize`。

## 3. scene 的最终接口

scene 可以继续暴露：

- query
- bounds
- node/edge/mindmap runtime view
- preview / spatial / selection 相关 read model

但不需要承担 committed write normalize 的任何 API。

---

## 八、需要下沉的具体内容

以下内容应明确纳入下一轮下沉范围。

### A. 必须从 editor/write 移走

- `patchNodeCreateByTextMeasure`
- `patchNodeUpdateByTextMeasure`
- `patchMindmapTemplateByTextMeasure`
- `patchMindmapInsertInput`
- `normalizeStickyFontModeUpdate`
- `isLayoutAffectingUpdate`

### B. 允许暂留在 editor，但只限 preview

- `patchNodePreviewByTextMeasure`

前提是它只处理 transient preview，不写 committed document。

### C. 应拆出共享布局适配层

- `readLayoutKind`
- `buildLayoutRequest`
- edge label fallback measure

这类逻辑不应该散落在 editor write 与 scene 各自调用链中。

---

## 九、对 `readXxx` helper 的最终收口规则

后续审计 editor 层 helper 时，按下表处理。

| helper 类型 | 是否允许保留 | 最终归属 |
| --- | --- | --- |
| 纯本地 selector / 小算法 | 允许 | 原模块内部 |
| committed write normalize | 不允许 | mutation/core |
| runtime view 组装 | 不应留在 editor | editor-scene/query |
| 多 feature 复用的领域能力 | 不应继续是零散 helper | 正式 query/service |
| 命名为 `read` 但实为复杂 derive/normalize | 允许重构保留逻辑，但必须更正层级或命名 | 视职责而定 |

---

## 十、一步到位实施方案

## Phase 1. 拆清 layout service 与 committed normalize

必须完成：

- 把 `textLayout.ts` 中的 committed normalize 逻辑与 preview 逻辑分离
- 明确 layout request builder / layout measure adapter 的独立边界
- editor 层不再拥有 committed patch 构造入口

阶段完成标准：

- `textLayout.ts` 不再同时承担 committed write 与 preview 两类职责

## Phase 2. 下沉 committed normalize 到 mutation/core

必须完成：

- `node.create`
- `node.update`
- `mindmap.create`
- `mindmap.topic.insert`

全部改为在 mutation/core 内部做 layout normalize。

阶段完成标准：

- `editor.write.*` 不再调用任何 `patch*ByTextMeasure`

## Phase 3. 收口 editor write

必须完成：

- `createNodeWrite`
- `createMindmapWrite`
- `createMindmapTopicWrite`

去掉对：

- `measure`
- `nodes`
- projection geometry 依赖

阶段完成标准：

- editor write 只表达 intent，不再持有布局语义

## Phase 4. 审计 editor 层 `readXxx` helper

必须完成：

- 列出所有影响 committed write 的 helper，并全部下沉
- 列出所有其实应归 scene/query 的 runtime helper，并迁移或升格
- 剩余 helper 限定为 editor 本地交互细节

阶段完成标准：

- editor 层不再承担下层领域语义拼装

## Phase 5. 最终收尾

必须完成：

- 删除 editor 层围绕 text measure 的 write-time adapter
- 删除与 committed normalize 相关的过渡 helper
- 更新测试，使 contract 明确绑定到 mutation/core 而不是 editor write

阶段完成标准：

- text layout / write / scene / mutation 四层职责单轨清晰

---

## 十一、最终验收标准

以下条件必须同时成立：

- `editor.write.*` 只负责发 intent，不再做 layout-driven committed patch
- 所有文本测量驱动的 committed 字段归一化都在 mutation/core 完成
- `editor-scene` 只负责 projection/runtime read model，不负责 write normalize
- preview layout 与 committed layout 彻底分层
- `textLayout.ts` 不再是三种职责混合的总集散地
- editor 层 `readXxx` helper 只保留本地交互细节，不再承担下层领域语义拼装

这就是这块架构的长期最优终态。
