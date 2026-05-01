# WHITEBOARD_EDITOR_SCENE_SYNC 重构方案

## 1. 背景

现在 [projectionSync.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/editor/projectionSync.ts:1) 承担了过多职责。

它不只是一个薄的 wiring 层，而是在做一整套中间翻译：

- 把 `state-engine` + input preview + hover 组装成 scene 能吃的 snapshot
- 把 editor commit 转成 scene 能吃的 delta
- 把 document commit 对 preview 的影响再补成一份额外 delta
- 合并多份 delta 再喂给 scene runtime

这说明当前上下游并没有直接打通。

换句话说：

- 上游 `state-engine` 说的是一套语言
- 下游 `editor-scene` / `scene.update(...)` 说的是另一套语言
- `projectionSync.ts` 夹在中间负责翻译

如果最终架构是正确的，这一层应该极薄，最好缩到几乎不需要单独文件。

---

## 2. 问题判断

### 2.1 现在这层为什么偏厚

当前 `projectionSync.ts` 主要在补三类缝：

1. 状态形状不一致

- `state-engine` 持有的是 editor local state 文档
- `editor-scene` update 协议需要的是另一套 `EditorProjectionSnapshot`

2. 变更语义不一致

- `state-engine` commit 只知道哪些 local block 变了
- `editor-scene` update 更关心哪些 node / edge / mindmap / chrome 受影响

3. preview 语义归属不清楚

- 一部分 preview 数据在 input/runtime 里临时拼
- 一部分 delta 在 `projectionSync.ts` 里再翻一次
- document commit 对 preview 的影响又在中间层单独补

### 2.2 为什么这不是最终状态

如果这层长期存在并保持当前复杂度，会导致：

- `createEditor.ts` 继续依赖中间翻译层
- `state-engine` 无法直接成为 scene 的 editor truth source
- `editor-scene` update 协议继续是一套“外部专用协议”
- preview / hover / mindmap preview 的边界长期模糊

所以这里不是“可以接受的小 adapter”，而是当前架构尚未完全收口的信号。

---

## 3. 重构目标

这次重构的目标不是“优化一下 `projectionSync.ts`”，而是：

- 让 `state-engine` 和 `editor-scene` 直接说同一种语言
- 把 `projectionSync.ts` 压成极薄 wiring，最终最好删除

最终理想主链应接近：

```ts
engine commit -----------------------------\
                                            -> scene.update(...)
state-engine commit / preview commit ------/
```

而不是：

```ts
engine/state-engine
  -> projectionSync.ts
    -> build snapshot
    -> derive delta
    -> merge delta
      -> scene.update(...)
```

---

## 4. 最终目标状态

### 4.1 scene update 协议直接对齐 state-engine

最终希望 `scene.update(...)` 的 editor 输入协议，直接等于 `state-engine` 的公开状态文档和公开 delta 文档。

也就是说，不再有一套专门为 scene 发明的中间 snapshot/delta 形状，再由中间层翻译。

目标方向：

当前已经先完成 Phase 1 的协议收敛命名：

```ts
type SceneUpdateInput = {
  document: {
    snapshot: WhiteboardDocument
    rev: Revision
    delta: MutationDelta
  }
  editor: {
    snapshot: EditorSceneSnapshot
    delta: EditorSceneDelta
  }
}
```

其中：

- `EditorProjectionSnapshot` 已改为 `EditorSceneSnapshot`
- `EditorProjectionDelta` 已改为 `EditorSceneDelta`
- `ProjectionUpdateInput` 已改为 `SceneUpdateInput`

Phase 1 完成的含义是：

- 上下游先统一使用最终协议名
- 不再继续扩散 `projection` 这套中间协议术语
- 但 snapshot / delta 的真实生产仍然暂时经过 `projectionSync.ts`

名字后续可以调整，但原则不变：

- scene 输入协议与 state-engine 输出协议同构

### 4.2 preview 结构直接对齐

最终不再在中间层做这些转换：

- `readNodePreviews(...)`
- `readEdgePreviews(...)`
- `readDrawPreview(...)`
- `readMindmapPreview(...)`
- `readInteractionHover(...)`

也就是说，preview / hover / mindmap preview 的最终生产结构必须从源头就长成 scene 可消费结构。

### 4.3 commit 直接产出 semantic delta

最终不再依赖这套链：

```ts
MutationDelta
  -> createEditorStateMutationDelta(...)
  -> collectEditorProjectionCommitFlags(...)
  -> createEditorProjectionDeltaFromCommitFlags(...)
```

而是让 `state-engine` 直接提供 scene 可消费的 semantic delta。

目标方向：

```ts
const commit = stateRuntime.commit(...)

scene.update({
  editor: {
    snapshot: stateRuntime.snapshot(),
    delta: commit.sceneDelta
  }
})
```

### 4.4 document commit 不再由中间层补 preview delta

最终不再需要：

- `createDocumentProjectionDelta(...)`

因为 document 变化对 editor preview 的影响只能有两种合法归属：

1. 上游 `state-engine` 已经明确产出受影响的 editor delta
2. 下游 scene runtime 根据 document snapshot 自己决定如何更新

不应该再由中间层根据“前后 snapshot 差异”补一份额外 delta。

---

## 5. 设计原则

### 5.1 不增加第三套协议

这次重构严禁再引入：

- 新的中间 snapshot
- 新的中间 delta
- 新的 bridge runtime

目标是减少协议，而不是换一套新的中转协议。

### 5.2 state-engine 是 editor local truth

既然已经决定：

- document truth 只有 `engine`
- editor local truth 只有 `state-engine`

那 scene 的 editor 输入就应该直接建立在 `state-engine` 上，而不是再加一层独立文档模型。

### 5.3 scene runtime 只吃最终输入

`editor-scene` 不应该知道 input runtime / hover service / session 里各种历史结构。

它应该只吃：

- document snapshot + delta
- editor snapshot + delta

并且 editor snapshot + delta 必须已经是最终规范形状。

### 5.4 preview 归属必须单一

preview 相关数据只能有一个明确出口。

不能继续存在这种分裂：

- input/runtime 层先拼一部分
- projectionSync 层再翻一部分
- document commit 时再补一部分

最终必须清楚回答：

- 谁生产 preview snapshot
- 谁生产 preview delta
- 谁拥有 hover 语义
- 谁拥有 mindmap preview 语义

---

## 6. 建议的最终分层

### 6.1 state-engine

负责：

- editor local source document
- editor local command reducer
- editor local semantic delta 生产

对外应直接提供：

```ts
type EditorStateRuntime = {
  snapshot(): EditorStateDocument
  dispatch(command | commands): void
  commits: {
    subscribe(listener: (commit: {
      snapshot: EditorStateDocument
      delta: EditorStateSemanticDelta
      mutation: MutationDelta
    }) => void)
  }
}
```

注意：

- 这里的 `delta` 指 scene 可直接消费的 semantic delta
- 不再只是 mutation footprint

### 6.2 input runtime

负责：

- 产生 transient preview source
- 驱动 `state-engine` dispatch

但不再负责定义一套专用 scene preview 协议。

如果需要实时 preview：

- 直接写回 `state-engine.preview`
- 或者产出与 `EditorStateDocument.preview` 同构的 transient overlay

最终都要说同一种数据结构。

### 6.3 createEditor

`createEditor.ts` 最终只做 orchestration：

- 读 engine snapshot
- 读 state-engine snapshot
- 订阅两边 commit
- 直接调用 `scene.update(...)`

它不应该再负责：

- 拼 snapshot
- 翻译 hover
- 合成 preview
- 从 commit flags 推导 scene delta
- 从 document 前后差异补 preview delta

### 6.4 editor-scene

`editor-scene` 只认最终协议。

它不应该关心：

- 这些 editor 数据最早来自哪个 service
- hover 原来是什么结构
- mindmap preview 原来是什么中间稿

---

## 7. 分阶段实施方案

## Phase 1：定义最终同构协议

状态：

- 已完成

目标：

- 让 `state-engine` 输出协议和 `scene.update(...)` 输入协议同构

要做的事：

- 明确 `EditorStateDocument` 中哪些字段就是最终 scene editor snapshot
- 明确 `EditorStateSemanticDelta` 的最终形状
- 删除或废弃独立的中间 scene editor snapshot/delta 设计

完成定义：

- 协议命名已经收敛为：
  - `EditorSceneSnapshot`
  - `EditorSceneDelta`
  - `SceneUpdateInput`
- `projection` 不再作为公开协议名继续扩散
- `stateRuntime.snapshot()` 已成为后续 Phase 2/3 对接的固定出口
- 真实数据结构仍待 Phase 2/3 继续收敛，当前尚未删除中间翻译实现

## Phase 2：把 preview / hover / mindmap preview 收口到 state-engine

目标：

- 不再在 `projectionSync.ts` 中做 preview 语义翻译

要做的事：

- 调整 `state-engine.preview`
- 调整 interaction hover 结构
- 调整 mindmap preview 结构
- 让这些结构从生产端就对齐 scene 需要的最终协议

完成定义：

- 删除：
  - `readNodePreviews(...)`
  - `readEdgePreviews(...)`
  - `readDrawPreview(...)`
  - `readMindmapPreview(...)`
  - `readInteractionHover(...)`

## Phase 3：让 state-engine commit 直接产出 semantic delta

目标：

- 不再从 mutation footprint 二次推导 scene delta

要做的事：

- 在 `state-engine` 内部直接构建 semantic delta
- commit 订阅直接拿到 scene 可消费 delta

完成定义：

- 删除：
  - `collectEditorProjectionCommitFlags(...)`
  - `createEditorProjectionDeltaFromCommitFlags(...)`

## Phase 4：去掉 document -> preview 的中间补丁逻辑

目标：

- 不再在中间层根据前后 snapshot 补 preview delta

要做的事：

- 明确 document commit 后 preview 影响的归属
- 让影响在上游或下游被单点处理

完成定义：

- 删除：
  - `createDocumentProjectionDelta(...)`
  - `mergeEditorProjectionDelta(...)`

## Phase 5：把剩余薄 wiring 并回 createEditor

目标：

- `projectionSync.ts` 彻底消失

要做的事：

- 把最后剩下的 bootstrap/update wiring 并回 `createEditor.ts`

最终期望：

```ts
scene.update({
  document: {
    snapshot: engine.doc(),
    rev: engine.rev(),
    delta: commit.delta
  },
  editor: {
    snapshot: stateRuntime.snapshot(),
    delta: commit.sceneDelta
  }
})
```

---

## 8. 本次重构中明确不做的事

- 不保留兼容层
- 不保留双轨 snapshot/delta
- 不让旧的 `projectionSync.ts` 逻辑继续存在于别的文件里
- 不为了“先跑通”而回补 bridge/runtime facade

---

## 9. 删除清单

目标完成后，这些函数应当消失：

- `buildEditorProjectionSnapshot(...)`
- `createBootstrapEditorProjectionDelta(...)`
- `collectEditorProjectionCommitFlags(...)`
- `createEditorProjectionDeltaFromCommitFlags(...)`
- `createDocumentProjectionDelta(...)`
- `mergeEditorProjectionDelta(...)`

最终目标文件状态：

- [projectionSync.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/editor/projectionSync.ts:1) 删除

---

## 10. 完成判定

当满足下面这些条件，说明这次重构真正完成：

1. `createEditor.ts` 不再依赖中间 snapshot/delta 翻译层
2. `state-engine` 可以直接提供 scene 需要的 editor snapshot
3. `state-engine` commit 可以直接提供 scene 需要的 editor delta
4. document commit 不再通过中间层补 preview delta
5. preview / hover / mindmap preview 不再通过中间层翻译
6. `projectionSync.ts` 已删除

---

## 11. 最终结论

`projectionSync.ts` 现在之所以存在且偏厚，不是因为“系统天然就需要这样一个大同步层”，而是因为当前上下游还没有完全打通。

正确的最终方向不是继续维护这层，而是：

- 让 `state-engine` 和 `editor-scene` 直接说同一种协议
- 把中间翻译逻辑全部消掉
- 把最后极薄的 orchestration 收回 `createEditor.ts`

所以这次重构的本质不是“重写同步层”，而是：

- 消灭同步层存在的前提
