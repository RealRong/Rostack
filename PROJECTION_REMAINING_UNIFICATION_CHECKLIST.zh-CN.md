# Projection 剩余收口清单

## 1. 目标

这份清单只讨论：

- dataview 和 whiteboard 里
- 仍然存在的中转层
- 重复抽象
- 没有完全基于新 projection 工作的部分

标准只有一个：

- **长期最优**
- **不考虑兼容**
- **尽量只留下领域逻辑**
- **底层设施尽量统一复用**

---

## 2. 当前总体判断

### 2.1 whiteboard

whiteboard 的 `editor-scene` 核心已经基本完成 projection 化：

- 已经使用 `ProjectionSpec`
- 已经使用 `createProjectionRuntime(...)`
- 已经去掉 shared builder 依赖

whiteboard 当前剩余问题，主要不是“没用 projection”，而是：

- 还有少量 runtime facade
- 还有必要的 orchestration 层
- 还有本地重复的 scope schema helper

结论：

- **whiteboard 已接近最终形态**
- 剩下主要是收边、命名、去薄壳

### 2.2 dataview

dataview 当前只有 active 的 phase runtime 完成了 projection 化。

但外围仍然保留：

- `mutation/publish.ts` 手工 glue
- `index` 手工派生
- `document delta` 手工组装
- active 外围历史 `projector` 命名和薄包装

结论：

- **dataview 还处于半新半旧状态**
- 它是下一阶段最该继续收口的重点

---

## 3. 必删薄包装

这些层没有独立架构价值，应该继续删除。

## 3.1 dataview `active/projector/*` 命名壳

当前残留：

- `dataview/packages/dataview-engine/src/active/projector/context.ts`
- `dataview/packages/dataview-engine/src/active/projector/createActiveProjector.ts`
- `dataview/packages/dataview-engine/src/active/projector/spec.ts`
- `dataview/packages/dataview-engine/src/active/projector/trace.ts`
- `dataview/packages/dataview-engine/src/active/projector/reset.ts`
- `dataview/packages/dataview-engine/src/active/contracts/projector.ts`

问题：

- 实际已经不是旧 projector runtime
- 内核已经是 `createProjectionRuntime(activeProjectorSpec)`
- 但目录、文件名、类型名仍然保留 `projector`
- `defineActiveProjectorPhase` 这种 identity wrapper 没有价值

长期最优：

- `active/projector` 整体改名为 `active/projection`
- `contracts/projector.ts` 改为 `contracts/projection.ts` 或更直接的 `contracts/activeProjection.ts`
- 删除 `defineActiveProjectorPhase`
- `createActiveProjector()` 如果只是在包内转一层 runtime，也应考虑内联到真正使用处

### 建议动作

- `active/projector/spec.ts` → `active/projection/spec.ts`
- `active/projector/createActiveProjector.ts` → `active/projection/runtime.ts`
- `active/contracts/projector.ts` → `active/contracts/projection.ts`
- 所有 `ActiveProjector*` 命名改成 `ActiveProjection*`

---

## 3.2 whiteboard `createEditorSceneModelRuntime / createEditorSceneRuntime`

当前残留：

- `whiteboard/packages/whiteboard-editor-scene/src/runtime/createEditorSceneRuntime.ts`

问题：

- `createEditorSceneModelRuntime(...)` 和 `createEditorSceneRuntime(...)` 本质只是两层 facade
- 真正的核心只有 `createProjectionRuntime(createEditorSceneProjectionSpec(...))`
- 其中大部分代码在做：
  - `read` → `query` 重命名
  - `working` 暴露
  - `state` 派生读取
  - `update/subscribe` 类型转换

长期最优：

- 把这层压成一个正式 scene runtime factory
- 如果 public contract 需要 `query` 这个名字，那就在唯一 runtime factory 里完成
- 不要保留 `ModelRuntime` 这种历史中间态命名

### 建议动作

- 删除 `createEditorSceneModelRuntime`
- 保留单一 `createEditorSceneRuntime`
- 只在这一层完成：
  - runtime 创建
  - public contract 映射

---

## 4. 必保留编排层

这些层虽然不是 projection runtime，但它们不是坏抽象，应该保留。

## 4.1 whiteboard `projection/bridge`

当前文件：

- `whiteboard/packages/whiteboard-editor/src/projection/bridge.ts`

它做的不是重复 projection，而是必要编排：

- 合并 document publish delta
- 合并 session delta
- 合并 interaction delta
- 合并 preview delta
- microtask batching
- flush orchestration
- 生成 scene runtime input

这层本质是：

- **scene orchestrator**
- **editor-scene input adapter**

不是坏抽象。

长期最优不是删除它，而是：

- 把职责命名清楚
- 不要再叫 `projection/bridge`
- 改成更符合事实的名字

### 建议动作

优先候选命名：

- `scene/orchestrator.ts`
- `scene/controller.ts`
- `scene/runtimeBridge.ts`

不建议继续保留：

- `projection/bridge`

---

## 4.2 whiteboard `boundary/runtime`

当前文件：

- `whiteboard/packages/whiteboard-editor/src/boundary/runtime.ts`

它做的是：

- procedure 执行
- publish signal 消费
- task 调度
- flush 边界控制

这是 editor 边界运行时，不是 projection 重复实现。

长期最优：

- 保留
- 但继续保持只做边界编排
- 不要把 projection 派生逻辑塞回这里

---

## 5. dataview 下一阶段

dataview 还没有真正完成 projection 大一统。

## 5.1 `mutation/publish.ts` 仍是总编排中心

当前文件：

- `dataview/packages/dataview-engine/src/mutation/publish.ts`

当前它还手工负责：

- `createDocumentReadContext(...)`
- `resolveViewPlan(...)`
- `createIndexState(...) / deriveIndex(...)`
- `activeProjector.update(...)`
- `projectDocumentDelta(...)`
- `publish.delta` 组装

这说明 dataview 当前还是：

```text
mutation commit
  -> publish.ts 手工编排
  -> index derive
  -> active projection
  -> delta assembly
```

而不是：

```text
mutation commit
  -> document projection
  -> index projection
  -> active projection
  -> publish adapter
```

### 长期最优

`mutation/publish.ts` 只保留 adapter 职责：

- 喂输入
- 推 runtime
- 取 capture
- 回填 mutation publish contract

不再负责读模型推导本身。

---

## 5.2 index 还不是正式 projection runtime

当前问题：

- active 已经用 projection runtime
- index 仍然是 `createIndexState / deriveIndex`

这会导致 dataview 保留两套读模型底座：

- 一套 projection runtime
- 一套 index derive runtime

### 长期最优

把 index 提升成正式 projection 单元：

- `createIndexProjectionSpec(...)`
- `createProjectionRuntime(...)`

然后 active 只消费 index 的 projection output。

---

## 5.3 document delta 还不是 projection output

当前文件：

- `dataview/packages/dataview-engine/src/mutation/documentDelta.ts`

当前它还是 `publish.ts` 旁边的辅助函数。

### 长期最优

把 document delta 也视为正式 projection output：

- 可以是 document projection 的 capture
- 也可以是 mutation publish 下的一层正式 projection adapter

关键点不是名字，而是：

- 不再让 `publish.ts` 自己手工理解和装配 document delta

---

## 5.4 active API 还不是 runtime-first

当前文件：

- `dataview/packages/dataview-engine/src/active/api/context.ts`

当前 `state()` 读取的是：

- `engine.current().publish?.active`

这说明 active runtime 还是内核内部步骤，对外暴露的是 publish snapshot。

### 长期最优

有两条路：

#### 路线 A：接受 snapshot-first

如果产品层只关心最终 active snapshot：

- 保持 `publish.active` 作为唯一 read source
- 但内部仍把 document/index/active 都 projection 化

这是较保守但干净的方案。

#### 路线 B：提升 active runtime 为正式 runtime

如果需要更强的 runtime 语义：

- active runtime 成为 engine 内部长期驻留 read runtime
- `publish.active` 只是它的 published capture

这条更彻底，但改动更大。

### 建议

长期最优但控制复杂度的方案是：

- **先做 document/index/active projection 大一统**
- **active API 继续读 publish.active**
- 不急着把 public active API 改成直接读取 runtime

---

## 6. whiteboard 下一阶段

whiteboard 核心 projection 已经成型，下一阶段主要是收边。

## 6.1 统一 scene 命名

当前问题：

- `projection/bridge`
- `EditorSceneBridge`
- `createEditorSceneRuntime`

这些名字混合了：

- projection
- scene
- bridge
- runtime

长期最优应该统一成 scene 语言，而不是 projection 语言。

### 建议

- `projection/bridge.ts` → `scene/orchestrator.ts`
- `EditorSceneBridge` → `EditorSceneOrchestrator`
- editor 层对外只讲：
  - scene
  - query
  - stores
  - orchestrator

不再扩散 `projection` 作为主架构名词。

---

## 6.2 scene runtime public contract 仍有手写同步面

当前文件：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`

这里手写了：

- `RuntimeStores`
- `Result`
- `Query`

问题不是错，而是：

- spec 的 surface / read 已经存在
- public contract 还需要手工同步一遍

### 长期最优

尽量减少这种“再描述一遍”的 contract。

可接受方案：

- 保留领域 public contract
- 但只保留真正产品侧需要的那一层
- 不再多加 `ModelRuntime` / `BridgeResult` / `SceneRuntimeState` 一类再包装

---

## 6.3 本地 scope schema helper 仍然重复

当前重复位置：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/delta.ts`
- `dataview/packages/dataview-engine/src/active/contracts/projector.ts`

两边现在都各自复制了一套：

- `ScopeSchema`
- `ScopeInputValue`
- `ScopeValue`
- `flag/set/slot` 对应本地字面量 helper

### 长期最优

有两种方案：

#### 方案 A：接受每个 domain 本地最小复制

优点：

- shared public API 仍然最小
- domain 自由度高

缺点：

- 有重复

#### 方案 B：抽一个 **internal-only** scope contract

例如：

- `shared/projection/src/internalScope.ts`

只给仓内 domain type reuse，用于：

- `ScopeSchema`
- `ScopeInputValue`
- `ScopeValue`

但不从 `@shared/projection` public API 导出。

### 建议

长期最优建议用 **方案 B**：

- 抽 internal-only type reuse
- 不增加 public API
- 去掉 dataview / whiteboard 的本地重复类型实现

---

## 7. 共同剩余问题

## 7.1 仍然存在“runtime 内核 + facade contract”双层

两边都有这个现象：

- 内核已经是 projection runtime
- 外层再暴露产品语义 contract

这本身不是问题。

问题只在于：

- facade 是否只是机械转发
- facade 是否引入第二套架构语言

长期最优要求：

- 允许 facade
- 不允许无意义重复 facade

判断标准：

- 如果 facade 只是在 rename + cast，应该删
- 如果 facade 在做产品边界建模，可以留

---

## 7.2 projection 名词不应该继续向上扩散

shared 层可以保留：

- `projection`
- `spec`
- `runtime`

但产品/领域层的主语言应该是：

- dataview：view / index / active / publish
- whiteboard：scene / query / session / interaction / orchestrator

也就是说：

- 不要再让上层长期使用 `projector`
- 也不要让上层过度暴露 `projection`

---

## 8. 最终实施顺序

## Phase A：dataview 命名与薄壳收口

- `active/projector/*` 改名为 `active/projection/*`
- 删除 `defineActiveProjectorPhase`
- `contracts/projector.ts` 改名

## Phase B：dataview projection 大一统

- index projection 正式化
- document delta projection 化
- `mutation/publish.ts` 退化为 adapter

## Phase C：whiteboard scene 收边

- 删除 `createEditorSceneModelRuntime`
- `projection/bridge` 改名为 `scene/orchestrator`
- 清理无意义 cast/facade

## Phase D：shared internal scope type reuse

- 提取 internal-only scope type contract
- dataview / whiteboard 去掉本地重复 scope 类型实现

---

## 9. 最终判断

一句话总结：

- **whiteboard 已经基本站在新 projection 之上，剩下主要是编排层命名和薄 facade 收口。**
- **dataview 还没有完全站到新 projection 之上，真正的问题在 `mutation/publish.ts + index derive + active 外围历史壳`。**

如果继续做下一轮，优先级应当是：

1. dataview `active/projector` → `active/projection`
2. dataview `mutation/publish.ts` 去手工 glue
3. index 正式 projection 化
4. whiteboard scene facade / bridge 命名收口
5. 提取 internal-only scope type reuse
