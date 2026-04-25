# Dataview 读边界与 Snapshot 语义清理方案

## 1. 核心结论

这次新增 filter 卡顿，暴露的不是一个孤立性能点，而是 Dataview/MutationEngine 当前有一组已经偏离 lazy COW 设计初衷的边界问题：

- `current()` 被同时当成“外部安全快照 API”和“内部普通读取 API”使用。
- 内部热路径大量通过 `current()` 读取文档，导致频繁整份 clone。
- `normalize` 的触发层级过高，steady-state commit 仍会做 document 级 normalize。
- `write/history/subscribe` 过度依赖 full snapshot，而不是以 delta 或 checkpoint 为中心。

这几个问题叠加后，lazy COW 虽然仍然在 reducer/apply 阶段生效，但其收益在外围被大量 snapshot materialization 抵消了。

一句话总结：

> 当前真正的问题不是“写入时 clone 太多”，而是“读边界不清，导致内部本应零成本的读操作也反复物化整份快照”。

---

## 2. 先回答两个直接问题

### 2.1 为什么历史上会大量使用 `current()`

原因并不神秘，基本是几个历史选择叠加的结果：

- `shared/mutation` 最早明确暴露的稳定读取入口就是 `current()` / `doc()` / `subscribe()` 这一组安全 API。
- 这些 API 天然易用，类型也完整，所以 Dataview 接入 `MutationEngine` 之后，内部实现就顺手继续沿用了它们。
- 当时没有把“engine 内部读取”和“外部消费者读取”严格区分开，也没有为内部热路径提供单独的 raw read API。
- 于是 `createEngine -> active api -> reader -> runtime/source` 这整条链都开始复用 `current()`。

这是一种非常典型的历史遗留：

- 早期为了简单，先把安全边界做在 getter 上。
- 后续系统逐渐复杂后，内部代码仍继续沿用这个外部 getter。
- 最后 snapshot API 被误用成普通内部读 API。

所以不是某一个人单点写错了，而是边界没有及时在架构上纠正。

### 2.2 `current()` 能不能不走 normalize，只做普通 getter；export 时再 clone？

先把事实说清楚：

- **现在的 `current()` 本来就不走 normalize。**
- 当前 `normalize` 发生在 `load()` 和 `commit()` 之后，不发生在 `current()` 读取时。

所以现在的问题不是“`current()` 读取时还在 normalize”，而是：

- `current()` 读取时在 **clone 整份 doc**。
- 内部热路径不该走这个 clone 边界。

至于设计上能不能让 `current()` 变成普通 getter，答案是：

- **可以。**
- 但如果追求长期最优，我更倾向于 **直接废弃模糊的 `current()` 语义**，改成显式 API，而不是继续让 `current()` 同时承载两种含义。

长期最优的命名应该更明确：

- `readState()` / `readDoc()` / `readPublish()`：内部 raw read，不 clone，不 normalize。
- `snapshot()`：对外安全快照，按需 clone。
- `export()`：用于序列化/导出边界，必要时做 detach / validate / normalize。

如果坚持保留 `current()`，那也应该明确二选一：

- 要么 `current()` 永远是 raw getter。
- 要么 `current()` 永远是 safe snapshot。

最差的状态就是现在这样：名字看起来像普通 getter，语义却是 snapshot，结果内部外部都在混用。

---

## 3. 当前真正不正确的地方

## 3.1 把 snapshot API 当成内部读 API

这是本次卡顿最直接的根因。

当前链路大致是：

```text
active/filter create
  -> patchView
  -> view()
  -> reader.views.activeId()
  -> reader.fields.get(fieldId)
  -> 每一步都可能读到 mutationEngine.current()
  -> current() clone 整份 doc
```

这类路径本质上只是：

- 取当前 active view
- 取 active view id
- 取一个 field

它们都属于 engine 内部普通只读访问，不应该跨过 snapshot 边界。

## 3.2 `current()` 语义含混

`current()` 这个名字本身有歧义：

- 从一般直觉看，它像“取当前内部状态”。
- 但当前实现里，它返回的是“对当前状态做了防御性 clone 的安全快照”。

这会带来两个问题：

- 调用方很容易误判成本。
- 架构层很容易把 snapshot 当成 state。

长期最优里，这种模糊命名不该保留。

## 3.3 document 级 normalize 仍在 steady-state commit 中执行

现在的 normalize 触发层级过高。

以 `view.patch` 为例，compile 阶段已经会对 view 本身做 normalize，但 commit 之后仍然会再跑 document 级 normalize。

这会造成：

- 局部实体已规范化
- commit 仍然全表扫一次 records/fields/views

这不符合 lazy COW 的目标，也不符合 entity-local mutation 的长期最优结构。

## 3.4 `subscribe/current/write/history` 太依赖 full snapshot

当前模型默认认为：

- 想读状态，就拿 full snapshot。
- 想监听更新，就把 full snapshot 推给 listener。
- 想记录 write，就携带 full snapshot doc。

这对 debug 很友好，但对 steady-state runtime 不友好。

Dataview 本身已经有 delta/publish/active source 这些基础设施，长期应当改为：

- 内部运行时消费 raw refs + delta。
- full snapshot 只在外部边界、checkpoint、导出、debug 时按需创建。

---

## 4. 长期最优的边界重定义

## 4.1 把三种读语义明确拆开

系统里其实存在三种完全不同的读取需求，现在被混在一起了。

### A. Internal Raw Read

用途：

- engine 内部逻辑
- compile/apply/publish
- active api
- projector
- runtime source

要求：

- 零 clone
- 零 normalize
- 直接返回当前 persistent roots / state refs

### B. Safe Snapshot Read

用途：

- 外部普通消费者读取当前状态
- 调试台查看当前状态
- 测试里断言对外可见状态

要求：

- 与内部状态解耦
- 调用者误改对象也不影响 engine 内部

### C. Export / Serialization Read

用途：

- 导出文档
- 持久化
- 跨进程/跨线程传输
- schema/version 边界检查

要求：

- 明确 detach
- 必要时 validate / normalize
- 语义与 snapshot 区分开

这三者绝对不应该继续共用一个 `current()`。

## 4.2 推荐的最终 API

如果不考虑兼容成本，我建议直接把 API 收敛成下面这组：

```ts
interface MutationEngine {
  readState(): InternalState
  readDoc(): Doc
  readPublish(): Publish | undefined

  snapshot(): MutationSnapshot<Doc, Publish>
  export(): ExportedMutationState<Doc, Publish>

  subscribeRaw(listener: (state: InternalState) => void): () => void
  subscribeSnapshot(listener: (snapshot: MutationSnapshot<Doc, Publish>) => void): () => void
}
```

其中语义必须硬性规定：

- `read*` 系列：内部 API，不 clone，不 normalize。
- `snapshot()`：只做安全快照，不额外 normalize。
- `export()`：专门用于导出边界，可按策略做 normalize/validate。

### 关于 `current()`

长期最优里，我建议：

- **直接删除 `current()`。**

因为它的名字没有表达读语义，一旦保留，历史代码很容易继续误用。

如果短期内必须保留一个名字兼容迁移，那么建议：

- `current()` 暂时等价于 `snapshot()`
- 但内部代码一律禁止继续使用它
- 迁完后删除 `current()`

---

## 5. normalize 的正确位置

## 5.1 不应该放在哪里

以下地方不应该再承担 document 级 normalize：

- 普通 getter
- 普通 snapshot
- steady-state 小粒度 commit

## 5.2 应该放在哪里

normalize 应只存在于真正需要它的边界：

### A. Load / Import / Migration 边界

适合做 document 级 normalize。

原因：

- 外部输入不可信
- schema 可能旧
- 文档整体形状可能不完整

### B. Compile / Entity Mutation 边界

适合做 entity-local normalize。

例如：

- `view.patch` 只 normalize view
- `field.patch` 只 normalize field
- `record.fields.writeMany` 只规范化被改到的 value shape

### C. Export 边界

只在明确要导出稳定文档表示时执行。

如果内部状态本身已经满足 invariant，export 甚至不一定需要再次 full normalize，只需要 validate 或按版本做一次 deterministic materialize。

## 5.3 推荐原则

推荐采用下面这个硬规则：

> steady-state mutation 只做局部 normalize，full document normalize 只允许出现在外部输入边界和导出边界。

---

## 6. Write / History / Subscribe 的长期最优调整

## 6.1 `write` 不默认携带 full doc snapshot

当前 `write.doc` 是一个 full cloned doc，这在 runtime 高频写入里成本太高。

长期更合理的做法是：

- `write` 默认只带 `forward / inverse / footprint / extra / revision`
- 如果需要 checkpoint，再显式生成 checkpoint snapshot

也就是说，`write` 应该以 mutation record 为中心，而不是以 full snapshot 为中心。

## 6.2 `history` 应以 inverse / checkpoint 为核心

历史系统真正需要的是：

- 回退能力
- 冲突判断
- checkpoint 恢复

它并不需要每条 write 都携带 full doc。

长期建议：

- 日常 history 只存 inverse / footprint / metadata
- 每 N 步或特定条件下生成 checkpoint
- debug 模式可选保留 full snapshot

## 6.3 `subscribe` 应优先走 raw + delta

Dataview runtime/source 已经偏向 delta-first 结构，长期应继续推进：

- 内部 source/runtime 订阅 raw state 变化和 publish delta
- 外部观察者才订阅 snapshot

否则 `emit -> current() -> clone -> source reset/apply delta` 这条链永远会有多余成本。

---

## 7. 推荐的清理顺序

## 阶段 1：先把读边界拆开

目标：

- 为 `MutationEngine` 增加 raw read / raw subscribe API
- 明确 snapshot/export 语义
- 内部热路径停止使用 `current()`

这一步是所有后续工作的基础。

优先替换的地方：

- Dataview `createEngine` 里的 `readDocument` / `readActiveState`
- active api context
- 依赖 `createDocumentReader(options.document)` 的内部 reader
- runtime/source 初始化与订阅链

## 阶段 2：把 `current()` 从内部世界驱逐出去

目标：

- engine 内部、projector、runtime、query api 禁止使用 `current()`
- `current()` 只保留给外部消费者，或者直接开始删除

建议方式：

- 代码规范层明确禁止
- 用名字强制区分 raw/snapshot

## 阶段 3：移除 steady-state commit 上的 full document normalize

目标：

- 保留 `load/import` full normalize
- 普通 commit 改成 entity-local normalize

这个阶段会真正释放 lazy COW 在 steady-state 写入上的收益。

## 阶段 4：改造 write/history 结构

目标：

- `write` 不再默认携带 full doc
- history 以 inverse/checkpoint 为主
- debug/inspection 再单独走 snapshot

## 阶段 5：把 dataview runtime 推到真正 delta-first

目标：

- source/runtime 内部只吃 raw refs + delta
- snapshot 只用于外部读边界

## 阶段 6：删掉模糊 API 与历史兼容层

目标：

- 删除 `current()` 这种语义不清的 API
- 删掉所有只为迁移存在的 wrapper
- 收敛到最终清晰边界

---

## 8. 这次排查里最值得先纠正的错误点

以下不是最终唯一改动点，但它们代表了当前边界错误最集中的几个位置：

- `dataview/packages/dataview-engine/src/createEngine.ts`
  - 内部 `readDocument` / `readActiveState` 不该继续走 `mutationEngine.current()`
- `dataview/packages/dataview-engine/src/active/api/context.ts`
  - `patchView` 前置读取不该跨 snapshot 边界
- `dataview/packages/dataview-core/src/read/reader.ts`
  - reader 模型应明确接 raw doc source，而不是模糊地接受一个可能返回 snapshot 的 getter
- `shared/mutation/src/engine.ts`
  - `current()/doc()/emitCurrent()/write.doc` 当前都偏 snapshot-first
- `dataview/packages/dataview-core/src/document/normalize.ts`
  - 适合作为 load/import/export 边界工具，不应继续主导 steady-state commit 成本

---

## 9. 最终应该建立的硬性约束

后续清理如果不想再次回到今天这个状态，必须立几条硬规则：

- 内部热路径禁止调用 snapshot API。
- Getter 不负责 normalize。
- Snapshot 不等于 export。
- Steady-state commit 禁止做 full document normalize。
- Write/history 不默认携带 full document snapshot。
- Runtime/source 优先消费 delta 和 raw refs，而不是 full snapshot。

这些规则如果只写在脑子里，迟早还会退化回去。它们必须被：

- API 命名
- 模块边界
- 类型签名
- 测试约束

共同固化。

---

## 10. 我的推荐结论

如果只追求长期最优，而不考虑兼容成本，我的最终建议不是“把 `current()` 改成不 normalize”这么小修小补，而是：

1. 删除 `current()` 这种模糊语义。
2. 新增 raw read / raw subscribe API。
3. 明确 `snapshot()` 与 `export()` 的不同职责。
4. 把 full normalize 逐出 steady-state commit。
5. 把 Dataview runtime 收敛成真正的 raw + delta 驱动。

这样清完之后，系统才会重新回到 lazy COW 应有的形态：

> 写入阶段只复制被改到的 persistent branch，读取阶段默认只读 raw state，只有跨边界时才显式物化 snapshot。

