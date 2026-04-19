# Whiteboard 协作与 Operation 设计面试稿

本文基于当前仓库里的两部分实现整理：

- `whiteboard/packages/whiteboard-engine`
- `whiteboard/packages/whiteboard-collab`

目标不是泛泛而谈 CRDT/OT，而是回答面试里更容易被追问的几个问题：

- 我们为什么把 whiteboard 的写路径设计成 command -> operation -> reduce -> commit
- 当前协作层到底是不是“operation 同步”
- 遇到并发冲突时，系统是怎么收敛的
- 现在的 Yjs 方案和理想中的 operation 同步方案，各自优劣是什么
- 如果我是面试官，会继续追问什么，应该怎么回答

## 1. 先给结论

如果只用一句话概括当前设计：

**whiteboard-engine 是 operation-first 的本地写内核，但 whiteboard-collab 目前不是 operation-over-network，而是“engine 内部 operation 化 + 协作层 snapshot 化 + 传输层依赖 Yjs 收敛”的方案。**

更直白一点：

- 在 engine 内部，所有高层命令最终都会翻译成统一的 `Operation[]`
- `Operation[]` 进入同一条写管线，做 sanitize、lock 校验、reduce、inverse/history、read impact 计算
- 但是到了 collab 层，当前并没有把本地 operation 增量写入 Yjs，也没有把远端 Yjs 增量反编译成细粒度 operation
- 当前实现里，本地提交同步到 Yjs 时会直接写入最新 document snapshot；远端 Yjs 变化回到 engine 时，也基本走整份 `document.replace`

所以面试里一定要把“内核设计”和“协作同步设计”分开讲，否则很容易把现状说重了。

## 2. 代码结构与职责分层

### 2.1 engine 的职责

`whiteboard-engine` 负责单机语义正确性，它要解决的是：

- 用户命令如何翻译为稳定、统一、可重放的 operation
- operation 如何顺序执行并生成新的 document
- 如何统一做约束校验，比如 locked node / locked edge
- 如何生成 inverse，支持 undo / redo
- 如何计算 read impact，避免全量刷新读模型

可以把它理解为一个“本地状态机内核”。

核心路径：

1. UI 或外部调用 `engine.execute(command)`
2. `translateWrite` 把 command 翻译成 `Operation[]`
3. `createWritePipeline` 统一做 sanitize、锁校验、reduce、finalize
4. `reduceOperations` 顺序应用 operation，生成：
   - 新 document
   - changeset
   - inverse operations
   - read impact
5. engine 产生 `Commit`，更新 document / read store / history

### 2.2 collab 的职责

`whiteboard-collab` 负责多人协作会话管理，它要解决的是：

- engine 和 `Y.Doc` 之间如何建立双向同步
- 初始化时到底以 engine 还是 Yjs 为准
- provider 何时算 synced
- 本地镜像写回和远端回放如何避免死循环
- 远端更新如何不污染本地 undo/redo 语义

可以把它理解为“协作适配层”，不是业务规则内核。

### 2.3 最重要的分层边界

这套设计最关键的边界是：

- `command` 是面向交互语义的
- `operation` 是面向持久化和重放语义的
- `Yjs` 是面向分布式同步和最终收敛的

这三层不应该混成一层，否则复杂命令、多端同步、历史回放会互相污染。

## 3. 当前写路径为什么要设计成 command -> operation

## 3.1 command 代表用户意图，operation 代表最小可执行事实

高层命令往往很复杂，例如：

- `node.move`
- `document.duplicate`
- `group.merge`
- `mindmap.insert`
- `mindmap.patch`

这些命令包含的是“用户想做什么”，不适合作为最终同步和回放单元，因为：

- 它们语义过粗，包含大量上下文推导
- 不同客户端可能因为版本、布局、默认值不同而翻译出不同结果
- 它们不天然可逆
- 它们不适合直接作为统一约束校验的输入

而 operation 更像“已经被求值后的事实变更”，例如：

- `node.create`
- `node.update`
- `edge.delete`
- `canvas.order.set`

这样做的价值是：

- 所有来源都能复用同一条 reduce 管线
- undo/redo 可以基于 inverse operation 实现
- 远端同步、本地执行、脚本导入都能共享同一个低层协议
- 业务约束只需要守在 operation 边界上，不需要散落在每个 UI 命令里

## 3.2 为什么不是直接改 document

如果 command 直接 mutate document，会立刻遇到几个问题：

- 无法稳定地产生 inverse，undo/redo 代价高
- 多来源写入很难统一校验
- 调试时只能看到“前后快照不同”，看不到“到底改了什么”
- 很难只让读模型增量失效

所以 operation 的价值不只是“方便同步”，更是为了让整个写系统可验证、可回放、可审计。

## 4. engine 的真实架构

## 4.1 核心对象

在当前代码里，engine 侧最重要的对象有四个：

- `EngineCommand`: 交互语义层命令
- `Operation`: 统一写操作协议
- `Draft`: 一次写入过程的中间结果
- `Commit`: 最终提交结果，包含 rev、doc、changes、impact

## 4.2 核心流程图

```text
UI / 外部调用
  -> engine.execute(command)
  -> translateWrite(command)
  -> Operation[]
  -> sanitizeOperations
  -> validateLockOperations
  -> reduceOperations
  -> inverse + readImpact + ChangeSet
  -> Commit
  -> documentSource.commit(doc)
  -> read store invalidate
  -> history.capture(...)
```

## 4.3 reduceOperations 的意义

`reduceOperations` 是整个写模型的核心。它做了几件很重要的事：

- 按顺序应用 operation，而不是隐式合并
- 每条 operation 都尝试构造 inverse
- 一旦某条 operation 不可逆或非法，整批失败
- 产出 `ChangeSet`
- 产出 `KernelReadImpact`，用于增量更新读模型

这说明当前内核并不是“随便 patch 一下对象”，而是显式的事务式批处理。

## 4.4 为什么是“批量 operation 顺序执行”

因为真实业务里很多动作都不是单条操作：

- 删除一个节点，往往要级联删除相关边
- 修改 mindmap 节点，可能需要整棵树 relayout
- remote unlock 后再 delete，必须允许放在同一批里合法通过

当前 lock 相关测试就体现了这一点：

- 单独删除 locked node / edge 会被阻止
- 但“同一批 operation 里先解锁再删除”是允许的

这其实是在表达一个很重要的架构原则：

**系统校验的是“这批操作执行后的合法性路径”，而不是只看第一条操作的静态表面。**

## 5. 写管线里的关键设计点

## 5.1 sanitize：把脏输入先规范化

当前的 sanitize 主要做两件事：

- 新建节点时，如果节点尺寸和类型默认 bootstrap 尺寸不一致，会先修正
- 空的 `node.update` 会被剔除

这一步的意义是：

- 把“输入噪音”挡在真正业务逻辑之前
- 减少历史记录和协作同步里的无效噪声

## 5.2 validateLockOperations：约束统一收口

lock 校验放在 write pipeline，而不是散落在各个 command translator 中。这样做的原因很实用：

- 本地命令和远端回放共享一套规则
- 不会出现“UI 禁了，但 remote op 还能绕过”的问题
- 可以支持“同一批里先 unlock 再改”的时序语义

这是多人协作里非常重要的一点。否则单机规则和远端规则很容易分叉。

## 5.3 inverse + history：不是附属能力，而是 operation 设计的核心收益

因为每个 operation 都显式构建 inverse，所以：

- undo/redo 不需要重新跑高层命令翻译
- history 可以只记录 forward/inverse 操作对
- 回放时仍然走统一 reduce 管线

而且 history 默认：

- `captureSystem = false`
- `captureRemote = false`

这意味着系统写和远端写默认不进入本地 undo 栈。这个选择很合理，因为用户通常期望撤销的是“我刚才干的事”，不是别人干的事。

## 5.4 read impact：为什么这套架构适合大画布

每次 reduce 都会计算：

- 是否需要 reset
- 哪些 node id 受影响
- 哪些 edge id 受影响
- 影响的是 geometry、value 还是 list

这使得读模型可以做增量失效，而不是每次全量重建。这是 operation 化设计非常实际的收益，尤其对白板这种节点、边、索引、投影很多的场景很重要。

## 6. collab 当前到底怎么工作

## 6.1 会话层的职责

`createYjsSession` 做的事情包括：

- 管理连接状态：`idle / connecting / bootstrapping / connected / disconnected / error`
- 处理 bootstrap 模式：
  - `engine-first`
  - `yjs-first`
  - `auto`
- 监听 engine commit，同步到 `Y.Doc`
- 监听 `Y.Doc` 的 `afterTransaction`，回放远端更新到 engine
- 通过 `localOrigin` 和 `suppressLocalMirror` 避免回环

## 6.2 bootstrap 模式为什么必要

三种模式背后的含义很清楚：

- `engine-first`: 本地 engine 是真相源，启动时把 engine 文档写进 Yjs
- `yjs-first`: 远端 Yjs 是真相源，启动时把 Yjs 快照灌回 engine
- `auto`: 有 Yjs 快照就以 Yjs 为准，否则以 engine 为准

这个设计非常适合实际接入：

- 本地新建白板时，通常 `engine-first`
- 打开已有协作文档时，通常 `yjs-first` 或 `auto`

## 6.3 当前 Yjs 里存的是什么

当前实现并没有把 operation log 存进 Yjs。

Yjs 里存的是一个结构化的 document snapshot，根路径大致是：

```text
whiteboard
  ├─ version
  └─ document
```

`document` 本质上是把整个业务文档转成 `Y.Map / Y.Array` 递归结构后放进去。

## 6.4 当前本地 -> Yjs 的同步方式

这是当前协作方案最需要澄清的点。

虽然函数名叫 `applyOperationsToYjsDocument`，但当前实现实际上没有按 operation 逐条修改 Yjs。它会：

- 忽略传入的 operation 明细
- 直接把最新 snapshot 整份写回 `Y.Doc`

也就是说，本地 engine 一次 commit 后，collab 并不是把 commit 里的 `operations` 映射为 Yjs 增量，而是把 commit 产出的最新 `doc` 作为整份状态同步到 Yjs。

## 6.5 当前远端 Yjs -> engine 的同步方式

远端回放也类似。

当 `Y.Doc` 发生事务后，session 会：

1. 从 Yjs materialize 出最新 document
2. 与 engine 当前 document 做 `compileRemoteDocumentChange`
3. 当前 diff 逻辑只有两种结果：
   - 完全相同：返回空 operation
   - 不同：返回整份 `replace`

这意味着当前远端更新基本是：

```text
remote Yjs change
  -> materialize latest document
  -> compare with current engine doc
  -> different
  -> engine.execute({ type: 'document.replace', document })
```

所以现在的多人协作不是“远端 operation 回放”，而是“远端 document snapshot 替换”。

## 6.6 这会带来什么效果

优点：

- 实现简单，容易收敛
- 不需要设计复杂的 op diff / OT / version vector
- 所有远端数据最终仍会回到 engine 的 document 模型
- bootstrap / resync 非常直接

代价：

- 丢失远端操作意图
- 无法做真正的细粒度 operation 级同步
- 冲突解释能力弱，只知道“文档变了”，不知道“对方做了哪几步”
- 远端变化当前基本走 `document.replace`
- `document.replace` 会清空 history，所以远端更新不会进入本地 undo 栈，但也会重置本地历史上下文

最后一条在面试里值得主动说出来，因为这是一个真实 trade-off，不是理论问题。

## 7. 当前方案下，并发冲突是怎么处理的

## 7.1 先说结论

**当前并发冲突不主要靠 operation transform 解决，而是主要依赖 Yjs 对共享状态的最终收敛，再由 engine 接受已经收敛后的最新 document。**

所以它不是典型的：

- 远端 op 到达
- 与本地未确认 op 做 transformation
- 再继续回放

而是更接近：

- 多端都在改共享 Y.Doc
- Yjs 负责把共享状态收敛到某个确定结果
- engine 收到结果后，用 replace 对齐本地 document

## 7.2 冲突发生在哪一层

当前冲突有两层：

### 第一层：Yjs 数据层冲突

如果两个客户端并发修改同一位置，最终由 Yjs 负责把共享文档收敛成一致状态。

这里要谨慎表达：

- 从代码现状可以确定，应用层写入的是整份 document snapshot
- 因为写的是整份 snapshot，所以业务层效果更接近“快照竞争”
- 最终不是应用自己做 op transform，而是由 Yjs 的共享类型冲突规则来决定哪个结构留存

如果面试官继续追问，可以这样答：

“基于当前实现，我不会把它描述为字段级意图合并。因为我们写回 Yjs 时是按 snapshot 替换，应用语义上更像整份状态竞争，只是底层借助 Yjs 获得确定性收敛和同步分发。”

### 第二层：engine 业务规则冲突

一旦远端状态 materialize 回来，本地 engine 看到的已经是收敛后的 document。

此时 engine 不再重新判断‘这两个并发意图谁该赢’，而是直接接受收敛结果：

- 相同则忽略
- 不同则 replace

换句话说，**当前架构把并发裁决尽量前移到 Yjs，engine 负责业务模型一致性，而不是并发意图仲裁。**

## 7.3 如果同时编辑同一节点，会发生什么

当前答案应当是：

- 两端本地各自先通过 engine 生成新的 snapshot
- 各自把 snapshot 写回 Yjs
- Yjs 收敛出一个最终共享 document
- 各端收到远端事务后 materialize 最新 snapshot
- 如果本地 engine 文档不同，就整份 replace

结果是：

- 最终会一致
- 但不一定保留每一端的操作意图
- 本地 undo 语义也不会像 operation 协议那样精细

## 7.4 如果遇到 locked node / edge 的并发修改怎么办

这里要区分“当前实现”与“理想方案”。

当前实现下，如果远端变化已经在 Yjs 层收敛成最终 document，那么本地回放基本是 `document.replace`，不会再逐条经过 `validateLockOperations`。

这意味着：

- operation 级别的 lock 约束，主要保证本地 engine 写入和未来可能的 op 回放语义
- 但在当前 snapshot 回放方案下，远端最终状态对本地而言是直接替换

因此如果面试官问：

“那 lock 约束在协作时是不是会被绕过？”

比较稳妥的回答是：

“以当前代码来说，协作层远端回放基本走 replace，所以严格意义上，remote 最终态不会逐条重新过一遍 operation lock 校验。这也是我会把它定义为 snapshot-sync，而不是 full operation-sync 的原因之一。如果要把业务约束完全统一到多人协作路径，下一步应该把远端 diff 编译成 operation，再走 engine.applyOperations。”

这个回答要比硬说“完全没问题”更可信。

## 8. 为什么当前不直接做 operation-over-network

因为 operation-over-network 的工程难度明显更高，至少要解决以下问题：

- operation 序列化协议与版本兼容
- 基于 revision / vector clock 的因果顺序
- 未确认本地操作与远端操作的重排
- 冲突合并策略，到底是 OT、CRDT-style op、还是 domain-specific merge
- 失败重放与幂等
- 老版本客户端如何理解新 operation

而 snapshot + Yjs 的路线有一个很现实的优点：

**先把“多人能稳定同步”做出来，再逐步把粒度从 snapshot 收敛到 operation。**

这对产品推进是合理的。

## 9. 当前 Yjs 方案的优缺点

## 9.1 优点

- 接入成本低，能快速得到同步、广播、provider 生态、awareness 能力
- bootstrap 和 resync 很简单，直接以 snapshot 为准
- 不需要先设计复杂的协作协议和日志存储
- engine 内部依然保留 operation 架构，不会把未来演进路线堵死
- 远端更新默认不会进入本地 undo 栈，用户体验更容易解释

## 9.2 缺点

- 同步粒度粗，当前基本是 snapshot 替换
- 写放大明显，大文档下不够经济
- 无法保留远端操作意图，不利于审计、回放、调试
- 冲突语义不够业务化，更多依赖底层共享状态收敛
- `document.replace` 会清空 history，本地历史连续性会受影响
- lock、权限、业务规则难以在远端回放路径上做到完全一致
- 以后要做评论、presence 之外的细粒度协同特性时，扩展性有限

## 10. 理想的 operation 同步方案长什么样

## 10.1 核心目标

理想方案不是放弃 Yjs，而是把层次摆正：

- Yjs 可以继续做传输和 presence
- 但业务同步单元应该变成 operation 或 change set

理想数据流：

```text
local command
  -> translate -> Operation[]
  -> engine.applyOperations
  -> Commit(ChangeSet)
  -> serialize changeset/op log
  -> sync to remote
  -> remote receives changeset
  -> causal ordering / dedupe / merge
  -> engine.applyOperations(remoteOps, { origin: 'remote' })
```

## 10.2 这样做的直接收益

- 远端回放真正复用 engine 规则
- lock / sanitize / finalize 语义完全统一
- history 可以更可控，不一定要因为 remote replace 整体清空
- 能精确知道每次协作到底改了什么
- 有机会做更细粒度冲突处理
- 更适合做审计日志、回放、离线重放、服务端二次处理

## 10.3 但它会更难

缺点也必须说清楚：

- 需要设计 op 协议和版本演进
- 需要解决顺序、幂等、重复投递
- 对“同一字段并发修改”必须定义业务策略
- mindmap、布局、副作用类命令会让 op 语义复杂很多
- 服务端或协作层实现难度会明显上升

## 10.4 一个务实的演进路线

如果让我做演进，我不会一次性重写，而会分三步：

### 第一步：保留 Yjs，但先把远端 diff 变成 operation

也就是：

- 本地仍然可以把 snapshot 写进 Yjs
- 但远端 materialize 后，不要直接 `replace`
- 先做领域级 diff，尽量编译为 `Operation[]`
- 编译失败时再 fallback 到 `document.replace`

这样至少能让更多远端变更复用 engine 规则。

### 第二步：本地提交改成增量写 Yjs

也就是把 `applyOperationsToYjsDocument` 真正实现成“按 operation 修改共享结构”，而不是整份 snapshot 替换。

收益：

- 降低写放大
- 提高收敛粒度
- 为远端 op 化打基础

### 第三步：把 Yjs 从“共享 document”降为“共享 op log / change stream”

到了这一步，Yjs 更像是 transport/runtime：

- whiteboard 业务真相源是 op/change log
- document 是由 engine materialize 出来的
- Yjs 提供网络同步、presence、断线恢复能力

这时系统才真正接近“operation 同步架构”。

## 11. 如果我是面试官，我会问什么

下面的问题是按面试真实节奏整理的，尽量覆盖追问路径。

## 11.1 为什么不让 UI 直接改 document，而要多一层 operation

建议回答：

“因为 command 是用户意图，不是稳定的持久化协议。operation 才是统一执行和回放的最小事实单元。把所有写入都收敛到 operation 层，才能统一做约束校验、inverse 生成、history、增量读模型失效和未来协作同步。”

可继续补一句：

“这层抽象的价值不只是协作，而是整个写系统的可验证性。”

## 11.2 为什么 command 和 operation 要分开

建议回答：

“很多 command 都是高层语义，比如 duplicate、mindmap.insert、group.merge，它们内部会展开成多个 operation。command 适合表达意图，operation 适合表达已求值的变更事实。如果把两者混在一起，undo/redo、远端回放、版本兼容都会很难做。”

## 11.3 为什么 operation 不是一条，而是一批

建议回答：

“因为一次用户动作往往不是单点修改，而是一组有顺序依赖的变更。比如删节点会删关联边，mindmap patch 会带来 relayout。批量 operation 可以表达事务边界，也支持像‘先解锁再删除’这种同批次合法路径。”

## 11.4 为什么 lock 校验放在 write pipeline，不放在 UI 层

建议回答：

“UI 只负责交互反馈，不应该成为唯一防线。真正的业务约束要放在 engine 的统一写路径里，这样本地命令、脚本导入、远端回放才会共享同一套规则。”

## 11.5 当前协作为什么选 Yjs

建议回答：

“因为它先帮我们解决了分布式同步、provider 接入、awareness、最终收敛这些基础设施问题。对产品初期来说，用 Yjs 先把多人同步跑通，成本比一开始就自建 operation 协议低很多。”

## 11.6 当前协作是不是 operation 同步

建议回答：

“严格说不是。engine 内部是 operation-first，但 collab 当前是 snapshot-oriented。local commit 到 Yjs 时写的是最新 document snapshot，remote Yjs change 回到 engine 时当前也基本是整份 document.replace。它保留了向 operation sync 演进的架构基础，但现状还不是 full operation-over-network。”

这个问题建议直接答透，不要模糊。

## 11.7 当前并发冲突怎么处理

建议回答：

“当前不是通过 operation transform 处理并发，而是主要依赖 Yjs 对共享状态做最终收敛，然后 engine 接受收敛后的最新 document。也就是说，当前保证的是最终一致，而不是保留每个并发操作的业务意图。”

## 11.8 如果两个人同时改同一个节点，会不会丢数据

建议回答：

“最终会收敛到一致状态，但从应用语义看，当前方案更接近快照竞争，不保证保留双方的完整操作意图。它解决的是‘大家最后看到一样’，不是‘每个并发意图都能被解释和保留’。这正是 operation sync 方案更有价值的地方。”

## 11.9 为什么 remote 更新不进 undo 栈

建议回答：

“因为用户撤销通常只期望撤销自己的操作，不应该把别人的修改撤掉。当前 history 默认不 capture remote/system。只是要补充一点，当前远端更新基本走 replace，而 replace 也会清空本地 history，这属于当前 snapshot 同步方案的 trade-off。”

## 11.10 现在这个方案最大的问题是什么

建议回答：

“最大问题不是能不能同步，而是同步粒度太粗。现在细粒度 operation 语义在 engine 里已经有了，但协作层没有真正消费它，导致远端语义丢失、history 受 replace 影响、业务约束无法完全沿协作路径复用。”

## 11.11 如果你来继续做，会怎么演进

建议回答：

“我会先做渐进式演进，而不是重写。第一步先把 remote document diff 尽量编译成 operation，再 fallback replace；第二步把本地 commit 增量写入 Yjs；第三步再考虑把共享真相源升级为 op log / change stream。这样可以一边保留当前稳定性，一边逐步把协作路径和 engine 内核对齐。”

## 11.12 为什么不直接全量 OT

建议回答：

“OT 适合文本等强顺序、强意图保留场景，但白板对象模型更复杂，包含节点、边、层级、布局、副作用、约束和批处理事务。对这种对象图编辑器，先把领域 operation 设计好，再决定协作层是 CRDT 化还是 OT 化，通常比一上来套通用 OT 更稳。”

## 11.13 Yjs 方案和 operation 方案谁更好

建议回答：

“不是绝对谁更好，而是阶段不同。Yjs snapshot 方案更适合快速落地和稳定同步；operation 方案更适合追求业务语义一致、细粒度冲突处理、审计和长远扩展。就当前代码来说，我会把它定义为一个合理的过渡架构，而不是最终形态。”

## 12. 面试里可以主动强调的设计亮点

如果想把这套设计讲得更高级一点，可以主动强调这四点：

- **统一写边界**：所有写入最终都走 operation pipeline
- **约束集中化**：sanitize、lock validate、reduce、history 都收口在 engine
- **读写分离**：commit 产出 read impact，说明系统已经在为大画布性能做设计
- **渐进式协作演进**：先用 Yjs 解同步问题，再逐步把业务语义拉回 operation 层

这四点比单纯说“我们用了 Yjs”更有架构含量。

## 13. 一个简短的标准回答模板

如果面试时间很紧，可以直接按下面这段回答：

“我们的 whiteboard engine 内部是 operation-first 架构。上层 command 只表达用户意图，真正落地时会翻译成统一的 operation，再经过 sanitize、lock 校验、reduce、inverse/history、read impact 计算后形成 commit。这么做的好处是单机写语义、undo/redo、读模型增量更新和未来协作都能共用同一条内核路径。

协作层目前接的是 Yjs，但严格说现在还不是完整的 operation 同步。当前 local commit 同步到 Yjs 时本质上写的是最新 document snapshot，remote Yjs change 回来后也主要是 materialize 成最新 document，再用 document.replace 对齐本地 engine。所以它解决的是最终一致和接入成本问题，而不是精细的 operation 冲突合并。

如果两边并发修改，当前主要依赖 Yjs 收敛共享状态，engine 接受收敛后的最终 document。这个方案优点是实现简单、同步稳定、易于 bootstrap/resync；缺点是粒度粗、远端意图丢失、history 会受 replace 影响。后续更理想的方向是把远端 diff 编译成 operation，逐步演进到真正的 operation-over-network。” 

## 14. 代码阅读索引

如果面试前还想快速过一遍代码，建议优先看这些文件：

- `whiteboard/packages/whiteboard-engine/src/instance/engine.ts`
- `whiteboard/packages/whiteboard-engine/src/write/index.ts`
- `whiteboard/packages/whiteboard-engine/src/write/normalize.ts`
- `whiteboard/packages/whiteboard-engine/src/types/command.ts`
- `whiteboard/packages/whiteboard-core/src/types/operations.ts`
- `whiteboard/packages/whiteboard-core/src/kernel/reduce.ts`
- `whiteboard/packages/whiteboard-core/src/kernel/history.ts`
- `whiteboard/packages/whiteboard-core/src/lock/index.ts`
- `whiteboard/packages/whiteboard-collab/src/session.ts`
- `whiteboard/packages/whiteboard-collab/src/yjs/apply.ts`
- `whiteboard/packages/whiteboard-collab/src/yjs/diff.ts`
- `whiteboard/packages/whiteboard-collab/src/yjs/materialize.ts`
- `whiteboard/packages/whiteboard-collab/test/yjs-session.test.ts`

## 15. 最后一句话

如果要给当前方案一个准确定位，我会这样定义：

**它不是一个已经完成的 operation 协作架构，而是一个已经把单机内核 operation 化、并且给协作演进预留好了接口的过渡态架构。**

这个表述通常既诚实，也足够体现架构判断力。
