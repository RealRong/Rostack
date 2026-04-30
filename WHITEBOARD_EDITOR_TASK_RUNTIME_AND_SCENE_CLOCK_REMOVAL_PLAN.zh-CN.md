# Whiteboard Editor Task Runtime 与 Scene 时间移除最终方案

## 1. 结论

- `clock` 不应进入 `editor-scene` 的 `source snapshot`、`source change`、`runtime delta`、`plan`。
- `editor-scene` 继续保持“输入变化后同步 projection，随后普通 query 立刻可读”的模型。
- `mindmap` 这类 workflow 不应建模为 `publish -> waitPublished`。
- 真正需要异步等待的只有 `frame / delay`，不是 `published`。
- `enter` 动画仅影响视觉，不影响 `query / hit / bounds / spatial`。
- `enter` 不使用独立 overlay node 模型；projection 输出仍然是一套统一 `node` render view。
- `editor` 内部维护 animation job；`editor-scene` 只消费当前帧的统一 `node.presentation`。

---

## 2. 最终职责边界

## 2.1 `editor-scene`

职责：

- 消费稳定输入：
  - `document`
  - `session`
  - `interaction`
  - `view`
- 同步 projection
- 暴露：
  - `query`
  - `stores`
  - `capture`

明确不负责：

- `clock`
- 帧调度
- animation job 生命周期
- `publish -> waitPublished` 协议
- enter path / duration / startedAt 的规划

## 2.2 `editor`

职责：

- 拥有 editor task runtime
- 拥有 animation job
- 在 workflow 中：
  - 修改 `session` / `preview`
  - 直接读取最新 `scene.query`
  - 决定下一步行为

## 2.3 `renderer / react`

职责：

- 消费统一 `node render view`
- 直接读取 `node.presentation.position ?? node.rect`
- 不解释第二套 overlay node / common node 模型

---

## 3. 最终模型

### 3.1 同步 projection

链路保持：

1. editor workflow 修改 session / preview
2. scene binding 收到变化
3. editor-scene runtime 同步 `update(...)`
4. `query / stores / capture` 同步变成最新结果

因此 workflow 后续直接读普通 `query` 即可，不需要：

- `waitPublished`
- `publishAndWait`
- 基于 `published` 的 task context

### 3.2 enter 动画仅影响视觉

规则：

- enter 不影响 `graph.node`
- enter 不影响 `spatial`
- enter 不影响 `query`
- enter 不影响 `hit`
- enter 不影响 `bounds`
- enter 只影响统一 node render view 的 `presentation`

### 3.3 不保留两套 node 模型

不采用：

- overlay node
- common node / overlay node 双模型
- render 侧再解释一套 enter entity

采用：

- projection 输出仍然是统一 `render.node[nodeId]`
- enter 只体现为该 node 当前帧的 `presentation`

---

## 4. 最终 API 设计

## 4.1 Scene Source

删除：

- `EditorSceneSourceSnapshot.clock`
- `EditorSceneSourceChange.clock`

`EditorSceneSourceSnapshot` 最终只保留：

- `document`
- `session`
- `interaction`
- `view`

## 4.2 Editor Task Runtime

初期最小 API：

```ts
export interface EditorTaskRuntime {
  nextFrame(): Promise<void>
  delay(ms: number): Promise<void>
  dispose(): void
}
```

说明：

- `nextFrame()` 是核心能力。
- `delay(ms)` 保留，供清理或结束延时使用。
- 不提供：
  - `publish`
  - `waitPublished`
  - `current`
  - `predicate`
  - `lane`
  - generator procedure signal

## 4.3 Node Render View

projection 输出仍是一套统一 node render view。

最终方向：

```ts
interface NodeRenderView {
  id: NodeId
  rect: Rect
  rotation: number
  style: NodeStyleView
  hidden: boolean
  presentation?: {
    position?: Point
  }
}
```

说明：

- `rect` 仍表示真实 graph/layout rect。
- `presentation.position` 只表示当前帧视觉绘制位置。
- 当前 enter 动画只有路径移动，因此 `presentation.position` 足够。
- 不引入：
  - `enterEffect`
  - `fromRect`
  - `route`
  - `startedAt`
  - `durationMs`
  - `hideBase`

这些完整动画参数只留在 editor task runtime 内部的 animation job，不进入 scene。

## 4.4 React 绘制规则

最终绘制规则：

```ts
const position = node.presentation?.position ?? {
  x: node.rect.x,
  y: node.rect.y
}
```

说明：

- node 只画一次。
- 不存在：
  - base node 再画一次
  - overlay node 再画一次
- 因此不需要 `hideBase`。

---

## 5. Enter 动画模型

## 5.1 editor 内部 animation job

editor 内部保留完整动画参数，例如：

- `nodeId`
- `fromRect`
- `route`
- `startedAt`
- `durationMs`

这些字段只存在于 editor 的 task/runtime/workflow 层，不进入 `editor-scene`。

## 5.2 每帧解算

task runtime 每一帧：

1. 基于 animation job 与当前时间解算当前位置
2. 将当前帧视觉位置写入 preview
3. scene binding 触发同步 projection
4. React 从统一 `node.presentation.position` 直接绘制

### 关键点

- scene 不需要 `clock`
- scene 不需要完整 enter spec
- renderer 不需要第二套 overlay node
- projection 只消费“当前帧结果”

## 5.3 Selection 行为

enter 动画期间：

- selection 不跟着动画中间位置移动
- selection 不需要解释 `presentation.position`

动画结束后：

- workflow 再切换 selection 到 enter topic
- 如需要，再进入 edit

这与“enter 仅影响视觉、不影响 query/hit/bounds”完全一致。

---

## 6. Boundary / Procedure 最终判断

不保留现有：

- `boundary/`
- generator procedure 协议
- `publish -> waitPublished`
- `atomic(...)`

替代为：

- `tasks/runtime.ts`
- `tasks/mindmap.ts`

如需要共享少量类型，可额外保留：

- `tasks/types.ts`

但不应再保留一整套 boundary 抽象。

---

## 7. 实施方案

### Phase 1：移除 scene clock

- 删除 `editor-scene` 中的：
  - `EditorSceneSourceSnapshot.clock`
  - `EditorSceneSourceChange.clock`
  - `EditorSceneRuntimeDelta.clock`
- 删除 `projection/input.ts` 中基于 `clock` 推导 runtime delta 的逻辑
- 删除 `projection/plan.ts` 中所有 `clock` 相关 touched scope / plan 逻辑
- `scene/binding.ts` 不再生成 `clock.now`

完成标准：

- `editor-scene` source / input / plan 中不存在 `clock`

### Phase 2：引入 editor task runtime

- 新增 `src/tasks/runtime.ts`
- 提供最小 API：
  - `nextFrame()`
  - `delay(ms)`
  - `dispose()`
- runtime 内部统一管理：
  - frame task
  - timeout task

完成标准：

- editor 有独立 task runtime
- 不再依赖 boundary task runtime

### Phase 3：移除 boundary / procedure

- 删除：
  - `src/boundary/runtime.ts`
  - `src/boundary/task.ts`
  - `src/boundary/procedure.ts`
- `createEditor.ts` 不再装配 boundary runtime
- `input/host.ts` 直接暴露 host handler，不再包 `atomic`

完成标准：

- editor 中不存在 `boundary`
- editor 中不存在 generator procedure signal 协议

### Phase 4：mindmap workflow 改写为 task runtime

- 将现有 `mindmap` procedure 改为普通 workflow
- workflow 内部维护 animation job
- workflow 不再：
  - `yield publish(...)`
  - `yield task.frame(...)`
  - `yield task.delay(...)`
- 改为：
  - 直接修改 preview / session
  - 直接读最新 `scene.query`
  - `await tasks.nextFrame()`
  - `await tasks.delay(ms)`

完成标准：

- `mindmap` workflow 不再依赖 procedure generator
- 不再出现 `waitPublished`

### Phase 5：统一 node presentation 输入输出

- 在 editor preview 中引入统一 node visual presentation 输入
- projection render phase 将其编译到统一 `render.node[nodeId].presentation`
- `query / spatial / bounds / hit` 完全忽略该 presentation
- React 直接按 `node.presentation.position ?? node.rect` 绘制

完成标准：

- enter 动画不再是独立 overlay node 模型
- render 侧只存在一套 node 模型

### Phase 6：删掉 scene 中的 enter spec 设计

- 不在 `editor-scene` 中保留：
  - `EnterEffect`
  - `fromRect`
  - `route`
  - `startedAt`
  - `durationMs`
  - `hideBase`
- 这些参数全部留在 editor task runtime 内部 animation job

完成标准：

- scene 只接收当前帧的统一 `presentation`
- scene 中不存在完整 enter 动画规划数据

---

## 8. 最终判断

长期最优不是：

- `publish -> waitPublished`
- `clock` 进入 scene source
- generator procedure 协议
- overlay node / common node 双模型
- scene 内部持有完整 enter animation spec

长期最优是：

- `editor-scene` 继续做同步 projection
- `editor task runtime` 负责时间推进
- workflow 直接修改 preview / session
- 修改后直接读普通 `query`
- enter 动画仅通过统一 `node.presentation.position` 影响视觉

一句话概括：

- `editor-scene` 负责同步投影
- `editor tasks` 负责时间与动画 job
- `workflow` 直接写 preview、直接读 query
- `React` 只画一套 node，按 `presentation.position ?? rect` 绘制
