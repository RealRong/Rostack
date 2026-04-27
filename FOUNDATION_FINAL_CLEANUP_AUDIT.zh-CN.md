# Foundation 最终收口审计

## 1. 结论

当前这轮 foundation 收口已经基本到位：

- `shared/mutation` 已经成为唯一 mutation / history 基础设施。
- `shared/collab` 已经直接建立在 mutation engine 正式能力之上。
- dataview / whiteboard 的 public engine 都已经去掉了 `load`、`writes`、`mutation` 这类历史中转入口。
- dataview / whiteboard 的 collab 都已经直接接 public engine，而不是再接一层 runtime/mutation wrapper。

也就是说，**大的兼容层、过渡层、中转层已经基本清空**。

现在剩下的不是架构分裂问题，而是几处**内部 API 形态还不够极致优雅**的问题。它们不会阻塞当前系统，但如果目标是长期最优、最少 API、最少类型、最少中转，这几处还值得继续收口。

---

## 2. 当前剩余的不优雅点

### 2.1 `MutationPort` 还在，但已经没有存在价值

当前 `shared/mutation/src/port.ts` 仍然定义并导出 `MutationPort`。

问题不在功能，而在定位：

- 它不是一个真正的 public domain API。
- 它也不是一个必要的组合边界。
- 它现在主要只是 `OperationMutationRuntime` 自己实现、以及少数内部类型约束在使用。

这会形成一个很典型的“抽象已失效但名字还留着”的状态。

长期最优结论：

- **删掉 `MutationPort` 这个名字和导出。**
- `OperationMutationRuntime` / `CommandMutationEngine` 直接暴露自己真实的正式 API。
- 如果内部确实需要一个最小约束类型，使用文件内私有类型，不要再成为 shared/mutation 的正式导出面。

换句话说，`MutationPort` 现在已经不是“可复用抽象”，只是“历史壳”。

---

### 2.2 `readHistoryPortRuntime(...)` + symbol runtime 是隐藏中转

当前 collab 需要 history 的三类内部能力：

- observe remote
- confirm published
- cancel pending

现在这些能力不是正式 API，而是通过：

- `createHistoryPort(...)`
- 在 port 上挂内部 symbol runtime
- `readHistoryPortRuntime(history)`

来读取。

这比之前的 `HISTORY_CONTROLLER` symbol cast 已经好很多，但本质上仍然是：

- public 口是一个对象
- internal 能力藏在 symbol 上
- collab 再偷偷读出来

这仍然是“隐藏中转”。

长期最优结论：

- **不要再保留 `readHistoryPortRuntime(...)` 这种二次读取器。**
- history 直接成为一个正式的双层 API：

```ts
type HistoryPort<Result, Op, Key, Commit> = {
  get(): HistoryState
  subscribe(listener: () => void): () => void
  clear(): void
  undo(): Result
  redo(): Result
  withPolicy(policy?): HistoryPort<Result, Op, Key, Commit>
  sync: {
    observeRemote(changeId: string, footprint: readonly Key[]): void
    confirmPublished(input: { id: string; footprint: readonly Key[] }): void
    cancel(mode: 'restore' | 'invalidate'): void
  }
}
```

这里的关键点不是把内部能力摊平到 engine 顶层，而是：

- **继续把它们收在 `history.sync` 命名空间里**
- API 语义明确
- collab 不需要再读 hidden runtime
- 不需要再暴露 `historyController()` 这种更底层的概念

这比：

- `historyController()`
- `syncHistory()`
- `readHistoryPortRuntime(...)`

都更自然。

---

### 2.3 `Write` 与 `ApplyCommit` 语义重复

当前 shared mutation 里同时有：

- `Write`
- `ApplyCommit`
- `ReplaceCommit`
- `CommitRecord`

其中 `ApplyCommit` 本质上只是 `Write + kind: 'apply'`。

这会带来两个问题：

1. 术语重复：有时叫 write，有时叫 commit。
2. collab 里需要 `toWriteRecord(commit)` 这种转换。

长期最优结论：

- **统一术语，保留 `Commit`，去掉 `Write`。**
- 直接使用：

```ts
type ApplyCommit<Doc, Op, Key, Extra> = {
  kind: 'apply'
  rev: number
  at: number
  origin: Origin
  doc: Doc
  forward: readonly Op[]
  inverse: readonly Op[]
  footprint: readonly Key[]
  extra: Extra
}

type ReplaceCommit<Doc> = {
  kind: 'replace'
  rev: number
  at: number
  origin: Origin
  doc: Doc
}

type Commit<Doc, Op, Key, Extra> =
  | ApplyCommit<Doc, Op, Key, Extra>
  | ReplaceCommit<Doc>
```

然后：

- history 捕获 `ApplyCommit`
- `MutationResult` 成功态携带 `ApplyCommit`
- `commits` 流输出 `Commit`
- collab 直接消费 `ApplyCommit`

这样可以删除：

- `Write`
- `toWriteRecord(...)`
- 一部分 `EngineWrite` / `EngineCommit` 的重复解释成本

如果还想继续极致收口，可以进一步统一命名：

- `MutationResult<T, Commit>`
- 不再在基础设施层保留 `write` 这个第二术语

---

### 2.4 `Origin` 里的 `'load'` 已经没有必要

当前 public engine 已经删除了 `load(document)`。

但 `Origin` 里仍然有：

- `'load'`

这意味着：

- API 面已经没有 `load`
- 但语义枚举里还保留了 “load 的痕迹”

这会让基础设施层继续背一个已经被删掉的历史概念。

长期最优结论：

- **从 `Origin` 里删除 `'load'`。**
- 文档替换、外部整体换入、初始化覆盖，统一走：

```ts
replace(document, { origin: 'system' })
```

如果真要表达“来自外部同步覆盖”，用：

```ts
replace(document, { origin: 'remote' })
```

不再保留单独的 `load` 语义。

这会同步简化：

- `shared/mutation/src/write.ts`
- dataview history track / clear 判断
- dataview performance 里的 `load -> replace` 分支
- 若干测试和 perf preset

这是很值得做的一步，因为它是真正的**概念删除**，不是改名。

---

### 2.5 dataview 里 `EngineFacadeHost` 还是一个内部中转壳

当前 dataview engine 的 API 组装是：

- `createEngine()` 先构造 `baseEngine: EngineFacadeHost`
- 再扩成 `engine`
- 再 `createFieldsApi(engine)` / `createRecordsApi(engine)` / `createViewsApi(engine)` / `createActiveViewApi(engine)`
- 中间还需要 `Omit<Engine, 'fields' | 'records' | 'views' | 'active'>` 这类 cast

这说明 dataview 已经去掉 runtime 中转了，但**API 组装层还有一个局部 facade 壳**。

长期最优结论：

- **删除 `EngineFacadeHost` 这个中心类型。**
- 每个 `createXxxApi(...)` 直接声明自己真正需要的最小入参。

例如：

```ts
createFieldsApi(input: Pick<Engine, 'doc' | 'execute'>)
createRecordsApi(input: Pick<Engine, 'doc' | 'execute'>)
createViewsApi(input: Pick<Engine, 'doc' | 'execute'>)
createActiveViewApi(input: Pick<Engine, 'current' | 'doc' | 'execute'>)
```

然后 `createEngine()` 直接：

- 先组出 engine 基础面
- 再把 `fields` / `records` / `views` / `active` 挂上去

不再需要：

- `EngineFacadeHost`
- `baseEngine`
- `Omit<...>` 的临时 cast

这不会改变架构，但会消掉一层内部概念。

---

### 2.6 whiteboard 的 `readPublish(...)` 暴露了 shared mutation 的类型保守性

whiteboard engine 里现在有：

- `readPublish(core.current().publish)`

根因不是 whiteboard 本身复杂，而是 shared mutation 当前的 `current().publish` 类型是可选的。

但对有 publish spec 的 engine 来说：

- `publish` 实际上是必有的。

长期最优结论：

- **shared/mutation 的 current 类型应区分“有 publish spec”与“无 publish spec”。**

目标效果：

```ts
const current = engine.current()
current.publish // 在有 publish 的 runtime 上应为必有
```

这样 whiteboard 可以删除：

- `readPublish(...)`

dataview 的 `toCurrent(...)` 也能更直接。

这是一个类型系统层面的优雅性问题，不是架构错误，但值得收口。

---

## 3. 哪些东西不需要再继续抽

下面这些点，当前我认为**不值得继续抽 shared helper**：

### 3.1 dataview / whiteboard 的 history config 不需要再统一 helper

虽然两边都有：

- `capacity`
- `captureSystem`
- `captureRemote`

但它们的：

- checkpoint 判定
- history capture 规则
- operation definition 接入方式

并不完全相同。

如果为这两个场景再抽一个 shared helper，结果很可能是：

- 增加 helper 名字
- 增加 helper 类型
- 增加理解成本

而不是减少复杂度。

所以这里长期最优不是“抽”，而是：

- **继续各自内联在各自 mutation spec 里。**

---

### 3.2 whiteboard-react 的 switchable history source 不算兼容层

`whiteboard-react` 里的 switchable history source 不是多余包装，它有明确运行时需求：

- editor 默认用 engine.history
- collab 接入后需要切换为 session.localHistory

因此这层保留是合理的。

长期最优要求不是删掉它，而是：

- 保持它只存在于 whiteboard-react runtime 这一层
- 不要回流成 shared/mutation 的通用 helper

这点当前方向是对的。

---

### 3.3 `createProjectionRuntime` 目前不需要再继续拆

projection 这条线当前已经比较干净：

- shared/projection 提供正式 runtime
- dataview / whiteboard-editor-scene 各自提供自己的 spec

只要后续继续坚持：

- shared 只暴露 runtime 级正式入口
- domain 只提供 spec

就已经足够简洁，不需要再引入额外 helper。

---

## 4. 最终推荐 API 形态

如果要继续把 foundation 做到极致优雅，我建议 shared/mutation 最终收口到下面这组概念：

### 4.1 正式 public 概念

```ts
type Origin = 'user' | 'remote' | 'system' | 'history'

type ApplyCommit<Doc, Op, Key, Extra> = { ... }
type ReplaceCommit<Doc> = { ... }
type Commit<Doc, Op, Key, Extra> = ApplyCommit | ReplaceCommit

type HistoryPort<Result, Op, Key, Commit> = {
  get(): HistoryState
  subscribe(listener: () => void): () => void
  clear(): void
  undo(): Result
  redo(): Result
  withPolicy(policy?): HistoryPort<Result, Op, Key, Commit>
  sync: {
    observeRemote(changeId: string, footprint: readonly Key[]): void
    confirmPublished(input: { id: string; footprint: readonly Key[] }): void
    cancel(mode: 'restore' | 'invalidate'): void
  }
}

class CommandMutationEngine<...> {
  commits: {
    subscribe(listener: (commit: Commit<...>) => void): () => void
  }
  history: HistoryPort<...>
  doc(): Doc
  current(): Current
  subscribe(listener): () => void
  replace(document: Doc, options?): boolean
  apply(ops: readonly Op[], options?): Result
  execute(intent | intent[], options?): Result
}
```

### 4.2 明确删除的概念

- `load(document)`
- `Origin['load']`
- `MutationPort`
- `readHistoryPortRuntime(...)`
- `Write`
- `HistoryBinding`
- public engine 上的 `mutation`
- public engine 上的 `writes`

---

## 5. 推荐实施顺序

如果继续做下一轮代码收口，建议顺序如下：

### Step 1

先删除 `Origin['load']`。

原因：

- 它是真正的概念删除。
- 影响面清晰。
- 做完后很多判断分支会自然变少。

### Step 2

再把 `Write` / `ApplyCommit` 统一成一套 commit 术语。

原因：

- 这是 shared/mutation 与 shared/collab 之间最明显的重复名词。
- 做完后 `toWriteRecord(...)` 可以一起删掉。

### Step 3

然后把 history runtime 从 symbol 读取改成正式 `history.sync` 命名空间。

原因：

- 这样 collab 与 history 的接口关系才真正完全显式化。
- 做完后 `readHistoryPortRuntime(...)` 可以删除。

### Step 4

最后清理 dataview 的 `EngineFacadeHost` 与 whiteboard 的 `readPublish(...)`。

原因：

- 这些已经属于局部装配层和类型层的精修。
- 放在最后做，改动最稳。

---

## 6. 最后判断

如果只问一句话结论：

**当前 foundation 已经没有大的兼容层和中转层了。**

接下来真正值得继续做的，只剩四件事：

1. 删除 `Origin['load']`
2. 删除 `Write`，统一到 `Commit`
3. 删除 `readHistoryPortRuntime(...)`，改成正式 `history.sync`
4. 删除 dataview 的 `EngineFacadeHost` 与 shared/mutation 类型保守性带来的局部 adapter

做完这四步后，整个 mutation / history / collab / engine 这条基础设施链路，基本就能到一个非常干净的长期形态。
