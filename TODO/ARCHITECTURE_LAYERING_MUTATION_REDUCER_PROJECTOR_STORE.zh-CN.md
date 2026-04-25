# 一种面向复杂产品内核的分层架构：Mutation、Reducer、Projector 与 Store

## 1. 背景

当一个产品足够复杂时，前端或客户端代码往往不再只是“页面 + 接口 + 状态管理”。它会逐渐演化出自己的产品内核：

- 有复杂文档模型。
- 有大量领域操作。
- 有撤销/重做。
- 有协作或远程变更。
- 有多种读模型与视图状态。
- 有性能敏感的增量更新。
- 有 UI 本地状态、临时态、预览态、派生态。

如果继续用普通业务前端的组织方式，代码很容易变成：

```txt
action handler
  -> 修改 document
  -> 顺手更新 cache
  -> 顺手维护 history
  -> 顺手通知 UI
  -> 顺手修正 selection
  -> 顺手刷新 derived state
```

这种方式短期快，长期会带来非常高的耦合：写入逻辑、读模型、UI 状态、缓存、历史、协作全部混在一起。最后每一个功能改动都可能牵动全局。

更好的方式，是把系统拆成几条职责清晰的主轴：

```txt
shared/core
  primitive only

shared/mutation
  MutationEngine

shared/reducer
  Reducer

shared/projector
  Projector

shared/store
  reactive source/store

domain-core
  document model + operations + domain rules

domain-engine
  compose mutation + reducer + projectors + public API

ui/react
  consume stores + send intents
```

这不是为了追求抽象而抽象，而是为了让复杂系统在长期演进中仍然保持可理解、可测试、可替换和可扩展。

---

## 2. 核心思想

这套架构的核心思想是：**把写入、变更应用、读模型派生、UI 订阅分开。**

可以概括成一条数据流：

```txt
UI sends Intent
  -> MutationEngine compiles Intent to Operations
  -> Reducer applies Operations to Document
  -> MutationEngine produces Write
  -> Projector derives Read Models from Write / Snapshot / Delta
  -> Store publishes reactive sources
  -> UI consumes sources
```

每一层只关心自己的职责：

- UI 不直接修改文档。
- Reducer 不关心 UI。
- Projector 不执行写入。
- Store 不理解领域规则。
- domain-core 不关心 React。
- domain-engine 只负责组合，不把所有逻辑塞到一起。

这种边界能显著降低复杂度。

---

## 3. `shared/core`：只保留 primitive

`shared/core` 应该是最底层、最稳定的包，只放无业务语义的 primitive。

例如：

```txt
json
string
equality
compare
collection
id
parse
set
order
```

它不应该包含：

- mutation runtime
- reducer context
- projector runtime
- store runtime
- history policy
- UI state
- domain model

## 为什么 core 要保持极小

很多系统一开始都会有一个 `core` 或 `shared` 包。随着项目增长，所有“暂时不知道放哪”的东西都会被放进去。久而久之，`core` 会变成事实上的杂货铺。

这会导致：

1. 依赖方向变模糊。
2. 所有模块都可以依赖所有工具。
3. 底层包越来越难改。
4. 新人无法判断某个能力属于哪一层。
5. 领域逻辑容易下沉到 shared，形成反向耦合。

因此，`shared/core` 的原则应该是：**宁可小，不要全。**

它只提供真正通用、长期稳定、没有领域含义的基础能力。

---

## 4. `shared/mutation`：写入主轴

`shared/mutation` 的核心是 `MutationEngine`。

它负责：

```txt
Intent -> Compile -> Operation[] -> Apply -> Write -> Publish -> History / Collab
```

它不负责具体领域规则。领域规则由 domain-core 或 reducer 提供。

## MutationEngine 的价值

在复杂系统中，写入不是简单的 `setState`。一次写入通常包含：

- 用户意图。
- 参数校验。
- 编译成底层操作。
- 应用到文档。
- 生成 inverse operations。
- 生成 history footprint。
- 生成 write record。
- 通知订阅者。
- 驱动 undo/redo。
- 接收 remote operations。

如果这些流程散落在各个业务 action 中，系统会很难维护。

`MutationEngine` 的价值是把写入流程收敛成一个稳定协议：

```ts
engine.execute(intent)
engine.apply(operations)
engine.writes.subscribe(listener)
engine.history.undo()
```

这样可以保证所有写入都经过同一条主轴。

## 它带来的优势

### 统一入口

所有写入都通过同一个 engine，避免绕路修改文档。

### 统一 write record

无论写入来自用户、插件、快捷键、脚本、协作远端，最终都变成标准 `Write`。

### 支持 history / collab

撤销重做和远程操作都依赖稳定的 operation/write 语义。

### 降低领域引擎复杂度

domain-engine 不需要自己手写 commit orchestration，只需要提供 spec。

---

## 5. `shared/reducer`：应用 operation 的内核

`shared/reducer` 的核心是 `Reducer`。

它负责：

```txt
Operation[] -> next Document + inverse + footprint + extra
```

如果说 `MutationEngine` 是写入流程的编排器，那么 `Reducer` 就是 operation apply 的执行器。

## 为什么需要 Reducer

在复杂文档系统中，apply operation 往往不只是修改字段。

它可能需要：

- 维护不可变或 COW 文档。
- 生成 inverse operation。
- 收集 history key。
- 记录变更范围。
- 生成 impact / delta / trace。
- 做 settle / reconcile。
- 处理 partial failure。

这些能力如果每个领域自己重复实现，最终会出现很多相似但不完全一致的 apply runtime。

`Reducer` 可以把通用流程收敛起来：

```ts
const reducer = new Reducer({ spec })
const result = reducer.reduce({ doc, ops })
```

领域侧只提供：

- operation handlers
- domain context
- draft adapter
- footprint key serializer
- done/settle 逻辑

## Reducer 的边界

Reducer 不应该知道：

- 用户 intent。
- UI 状态。
- read model。
- projector。
- React。
- 协作协议。

它只知道 operation 如何作用于 document。

## 它带来的优势

### apply 逻辑可测试

operation handlers 可以脱离 UI 和 engine 单独测试。

### inverse 和 history 一致

所有 operation 都通过同一套 inverse/footprint 机制。

### 领域逻辑更纯

handler 可以专注领域规则，不需要关心外层 commit 流程。

### 降低 mutation engine 复杂度

`MutationEngine` 不需要理解文档内部如何变化，只消费 `ReducerResult`。

---

## 6. `shared/projector`：读模型派生

`shared/projector` 的核心是 `Projector`。

它负责：

```txt
Input + Previous Snapshot + Delta / Impact
  -> Plan phases
  -> Run phases
  -> Publish Snapshot + Change
```

Projector 的意义是把写入后的文档状态，派生成适合读取和渲染的 read model。

## 为什么需要 Projector

领域文档通常不是 UI 最适合消费的结构。

例如：

- 文档是 normalized table，但 UI 需要分组后的树。
- 文档是图结构，但 UI 需要空间索引和可见区域列表。
- 文档是原始记录，但 UI 需要排序、过滤、搜索后的结果。
- 文档是持久状态，但 UI 还需要 draft、preview、hover、selection 等临时态融合后的视图。

如果 UI 每次都直接从 document 临时计算，会导致：

- 性能不可控。
- 计算逻辑散落在组件中。
- 缓存失效很难管理。
- 增量更新困难。

Projector 把这些派生逻辑集中成 read model runtime。

## Projector 的典型结构

```txt
plan
  decide which phases are dirty

phase
  update part of working read model

publish
  produce immutable snapshot + change

store sync
  update reactive sources for UI
```

Projector 适合处理：

- index
- query result
- visible list
- grouped tree
- layout snapshot
- spatial records
- view model
- UI projection

## 它带来的优势

### 写模型和读模型分离

Document 不需要为了 UI 查询而变形。

### 支持增量计算

Projector 可以根据 delta/impact 只重算受影响的部分。

### 多读模型并存

同一个 document 可以派生多个 projector：列表、看板、图、空间索引、搜索索引等。

### UI 更简单

UI 只消费已经准备好的 read model，不在组件里做复杂推导。

---

## 7. `shared/store`：响应式 source/store

`shared/store` 负责把 projector 的输出变成可订阅的 reactive source。

它不是领域状态管理框架，也不应该理解业务规则。

它提供：

- value store
- keyed store
- family store
- derived store
- batch update
- subscribe/read API

## 为什么 Store 独立存在

Projector 产出的是 snapshot/change，但 UI 通常需要更细粒度的订阅。

例如：

- 某个节点组件只订阅自己的 node view。
- 某个列表只订阅 ids。
- 某个 toolbar 只订阅 selection summary。
- 某个 row 只订阅自己的 record view。

如果 UI 每次订阅整个 snapshot，会造成过多渲染。

Store 层的职责是：

```txt
ProjectorResult(snapshot, change)
  -> sync value/family/keyed sources
  -> UI subscribes fine-grained data
```

## 它带来的优势

### 渲染粒度可控

组件可以订阅精确数据，而不是整棵状态树。

### UI 框架无关

store 本身不依赖 React，可以被 React、命令式 runtime、插件系统共同消费。

### 批量更新

projector result 可以一次 batch 同步多个 source，避免中间态。

---

## 8. `domain-core`：文档模型、operation 与领域规则

`domain-core` 是领域内核。

它包含：

- document model
- entity types
- operation types
- domain validation
- domain algorithms
- domain invariants
- normalization
- read-only domain helpers

它不应该包含：

- React 组件。
- UI store。
- projector runtime。
- network request。
- app shell。
- concrete product integration。

## 为什么 domain-core 要保持纯粹

domain-core 是系统最有价值、生命周期最长的部分。它定义产品真正的领域能力。

如果 domain-core 混入 UI、runtime、服务端、状态管理，就会变得很难复用和测试。

纯粹的 domain-core 可以：

- 被不同 UI 复用。
- 被测试直接调用。
- 被服务端或 worker 复用。
- 被协作层复用。
- 被迁移到新 runtime。

## domain-core 和 shared 的关系

shared 提供通用底座，domain-core 提供领域规则。

```txt
shared/reducer 提供 Reducer

domain-core 提供 operations + handlers
```

```txt
shared/projector 提供 Projector

domain-core 或 domain-engine 提供 projector phases
```

不要把领域规则下沉到 shared。

---

## 9. `domain-engine`：组合 mutation、reducer、projector 与 public API

`domain-engine` 是组合层。

它负责把底层设施和领域能力组装成产品可用的 runtime。

典型职责：

- 创建 `MutationEngine`。
- 创建 `Reducer`。
- 创建一个或多个 `Projector`。
- 连接 write stream 到 projectors。
- 维护 public API。
- 暴露 commands/intents。
- 暴露 query/read facade。
- 处理 load/reset/dispose。
- 处理插件或扩展入口。

它不应该把领域算法全部写在自己里面。

## 为什么需要 domain-engine

如果只有 domain-core 和 UI，UI 会被迫知道太多底层细节：

- 怎么 compile intent。
- 怎么 apply operation。
- 怎么获取 current doc。
- 怎么更新 read model。
- 怎么订阅 store。
- 怎么处理 history。

domain-engine 把这些组合隐藏起来，给外部提供稳定 API：

```ts
engine.execute(intent)
engine.current()
engine.query.xxx(...)
engine.sources.xxx.subscribe(...)
engine.history.undo()
```

## 它带来的优势

### UI 不接触内部机制

UI 不需要知道 mutation/reducer/projector 如何组合。

### 组合关系集中

write 到 projector、projector 到 store 的连接都在 engine 层。

### 替换成本低

可以替换 projector 实现、store 实现、history policy，而不影响 UI。

---

## 10. `ui/react`：消费 store，发送 intent

UI 层应该尽量简单。

它主要做两件事：

```txt
read: consume reactive stores / queries
write: send intents / commands
```

UI 不应该：

- 直接修改 document。
- 直接 apply operation。
- 直接维护 history。
- 在组件里维护复杂 read model。
- 在组件里拼接底层 delta。

## 理想 UI 数据流

```txt
component subscribes source
component renders view
user interaction happens
component sends intent
engine executes intent
projector updates source
component re-renders
```

UI 只表达交互和渲染，不承载领域内核。

## 它带来的优势

### 组件更薄

组件不再承担复杂状态推导。

### 行为更一致

所有写入都通过 engine，因此快捷键、菜单、拖拽、脚本、插件都走同一套逻辑。

### 更容易迁移 UI 框架

领域内核不依赖 React，未来可以迁移到其他 UI 或运行在 worker 中。

---

## 11. 这套架构解决的核心问题

## 11.1 解决写入路径混乱

没有统一写入主轴时，系统里会出现很多修改状态的路径。

有了 MutationEngine：

```txt
所有写入 -> engine.execute / engine.apply
```

这让 history、collab、audit、trace 都有统一入口。

## 11.2 解决 apply 逻辑重复

没有 Reducer 时，每个模块可能自己维护 inverse、dirty、impact。

有了 Reducer：

```txt
所有 operation apply -> reducer.reduce
```

这让 operation application 可测试、可复用、可约束。

## 11.3 解决读模型膨胀

没有 Projector 时，UI、store、query、cache 会混在一起。

有了 Projector：

```txt
document/write/delta -> read model snapshot/change
```

这让复杂派生状态有明确归属。

## 11.4 解决 UI 过度耦合

没有 Store/source 层时，UI 很容易直接依赖 engine 内部结构。

有了 Store：

```txt
ProjectorResult -> fine-grained sources -> UI
```

这让 UI 订阅粒度清晰，渲染性能可控。

---

## 12. 架构优势总结

## 12.1 可理解性

每一层都有明确职责：

```txt
core       基础工具
mutation   写入流程
reducer    应用 operation
projector  派生读模型
store      响应式订阅
domain     领域规则
engine     组合入口
ui         渲染交互
```

新人可以先理解数据流，再深入局部实现。

## 12.2 可测试性

每层都能单独测试：

- domain operation 测试。
- reducer apply 测试。
- mutation engine 测试。
- projector phase 测试。
- store sync 测试。
- UI interaction 测试。

测试不必总是启动整个应用。

## 12.3 可扩展性

新增功能时可以先判断属于哪一层：

- 新的用户行为：intent。
- 新的文档变更：operation/reducer。
- 新的读视图：projector。
- 新的订阅数据：store source。
- 新的 UI：component。

这避免所有功能都堆进同一个大模块。

## 12.4 可替换性

如果边界清晰，可以替换其中一层：

- 替换 store 实现。
- 替换 projector 调度策略。
- 替换 history policy。
- 替换 UI 框架。
- 把 reducer 放到 worker。
- 把 projector 增量计算优化为异步。

## 12.5 性能可控

复杂产品的性能瓶颈通常来自派生状态和 UI 重渲染。

这套架构通过：

- write delta
- reducer impact
- projector dirty plan
- snapshot/change publish
- fine-grained store sync

让性能优化有明确抓手。

---

## 13. 代价与约束

这套架构不是免费的。

它的代价包括：

- 初期设计成本更高。
- 类型和 spec 会更多。
- 需要严格维护层间边界。
- 小项目可能显得过重。
- 团队需要统一术语。

因此它适合：

- 编辑器。
- 表格/数据库类产品。
- 白板/画布类产品。
- 低代码/可视化搭建器。
- 协作型文档系统。
- 复杂 SaaS 数据产品。

不一定适合：

- 简单 CRUD。
- 一次性活动页。
- 状态很少的小应用。

## 最重要的约束

这套架构必须坚持依赖方向：

```txt
shared -> domain-core -> domain-engine -> ui
```

不能让 shared 反向依赖 domain，也不能让 UI 绕过 engine 直接改 document。

否则分层会失效。

---

## 14. 判断系统是否走在正确方向

可以用几个问题自查。

### 写入是否统一？

是否所有修改都经过 MutationEngine？

如果不是，history/collab/debug 会变困难。

### apply 是否纯粹？

Reducer 是否只负责 operation apply？

如果 reducer 里开始更新 UI store，就说明边界坏了。

### 读模型是否明确？

复杂 derived state 是否属于 Projector？

如果组件里到处临时计算 read model，就说明 projector 不够。

### UI 是否足够薄？

UI 是否只是消费 source、发送 intent？

如果 UI 里有大量领域变更逻辑，就说明 domain-engine 边界不清。

### shared 是否足够小？

`shared/core` 是否只剩 primitive？

如果 shared/core 里出现业务语义或 runtime 语义，就说明需要拆包。

---

## 15. 最终形态

理想最终形态可以概括为：

```txt
shared/core
  primitive only

shared/mutation
  MutationEngine

shared/reducer
  Reducer

shared/projector
  Projector

shared/store
  reactive source/store

domain-core
  document model + operations + domain rules

domain-engine
  compose mutation + reducer + projectors + public API

ui/react
  consume stores + send intents
```

它表达的是一种长期主义架构观：

- 让写入路径统一。
- 让领域规则纯粹。
- 让读模型独立。
- 让 UI 变薄。
- 让 shared 保持稳定。
- 让复杂性停留在正确的位置。

这套结构不是为了让代码看起来更“架构化”，而是为了让系统在功能持续增长、交互持续复杂、性能要求持续提高时，仍然能够稳定演进。
