# 写入链路去 `normalize` / 去 `sanitize` / 去 `validate` 最终方案

## 目标

本文不是保守评估，而是直接定义目标状态：

- 普通 typed write 主链路不再做 whole-document `normalize`
- 普通 typed write 主链路不再保留 legacy `sanitize`
- 普通 typed write 主链路默认不做 `validate`
- compile / apply 都不再承担“帮调用方纠错、修文档、兼容历史脏状态”的职责
- 系统假设：内部 typed writer / typed compile 直接产出 canonical state

一句话：

- **load 时修文档，write 时直接写对**

再激进一点：

- **没有迁移价值的 legacy sanitize 直接删**
- **不是执行语义必须的 validate 默认删**

---

## 最终结论

如果写入方已经保证：

- 输入是强类型
- compile 直接产出 canonical `MutationProgram`
- entity / view / node / field 在写入前就已经是最终形态

那么最终应当做到：

- `applyEntityPatchEffect` 以及 shared mutation apply 链路里的 document normalize 全部删除
- dataview / whiteboard runtime 普通写入后的 whole-document normalize 全部删除
- whiteboard 的 legacy sanitize 全部退出 runtime / engine / compile 主链路
- dataview / whiteboard 大部分 validate 全部删除
- 只保留极少数会影响执行语义或破坏核心结构的不变量检查

这不是“可以考虑”，而是应该收敛到的最终形态。

---

## 当前仍然存在的问题

## 1. shared mutation 把 domain 修复藏在 apply 后面

`shared/mutation/src/engine/program/apply.ts`
`shared/mutation/src/engine/runtime.ts`

当前问题：

- entity create / patch / delete 后会跑 `input.normalize(...)`
- runtime 初始化 / replace 也复用同一个 normalize 概念
- 导致 shared apply 同时承担：
  - 执行 program
  - 修 domain 文档
  - 隐式 canonicalize

这会带来几个坏处：

- patch 看似局部，实际上会触发整份 document 二次改写
- 行为边界不清楚，compile 写错了也可能被 runtime 偷偷修掉
- 复杂度被隐藏到基础设施层
- 难以证明“typed write 直接写对”

最终应改成：

- shared apply 只执行
- shared apply 不修文档
- shared apply 不 canonicalize

## 2. whiteboard 还保留 legacy sanitize 思路

`whiteboard/packages/whiteboard-core/src/document/sanitize.ts`
`whiteboard/packages/whiteboard-core/src/document/normalize.ts`

当前 sanitize 还在做：

- 去掉 legacy node 字段 `layer` / `zIndex`
- 用 `nodeApi.materialize.committed(...)` 补节点 size
- 重建 / 去重 / 修复 `canvas.order`
- 去掉悬空引用
- 补回缺失 top-level item

这类代码的本质不是 runtime write 逻辑，而是：

- 旧数据兼容
- 导入修复
- migration

如果系统目标是不再承接历史脏状态，这些逻辑就不应该只是“迁位置”，而应该：

- **优先直接删除**
- 只有确定仍然需要兼容旧快照 / 外部导入时，才保留在独立 import/migration 工具

也就是说：

- `sanitizeDocument` 不该留在 engine / runtime / compile 主链路
- 如果没有明确外部兼容需求，`sanitizeDocument` 本体就应该删除

## 3. dataview / whiteboard 还有大量“兜底式 validate”

当前很多 validate 的真实作用不是保护核心执行语义，而是：

- 为宽松输入兜底
- 为历史非 canonical 状态兜底
- 为“也许有人会传错”兜底

这种 validate 会带来：

- 大量分支和重复代码
- compile 路径膨胀
- reader/helper/context 绕更多圈
- 本应由类型系统和构造 API 保证的事情，被运行时重复检查

最终应改成：

- **默认不 validate**
- 只有少数执行语义必须的检查才保留

---

## 最终原则

## 1. 普通 write 主链路零 sanitize

普通 typed mutation write：

- 不清 legacy 字段
- 不补默认值
- 不重建 order
- 不修 dangling 引用
- 不 materialize 旧结构

如果写入需要这些行为，说明写入方没有直接产出 canonical 状态，应该回到 compile / constructor / factory 层解决，而不是在文档提交后补救。

## 2. 普通 write 主链路零 whole-document normalize

普通 typed mutation write：

- 不在 apply 后 normalize document
- 不在 entity patch 后 normalize document
- 不在 create/delete 后 normalize document
- 不在 shared runtime commit 前做整份修正

只允许：

- 按 program 直接执行
- 生成 inverse / delta / footprint

## 3. validate 默认删除

默认假设：

- compile 输入是 typed 的
- compile helper / builder 产物是 canonical 的
- 内部 API 只在可信调用路径上使用

因此默认策略应是：

- 不做 shape validate
- 不做 schema validate
- 不做兜底 validate
- 不做“如果不合法就帮你报错并继续”的宽容逻辑

## 4. 错误应该尽早在构造时暴露，而不是在 apply 后修正

系统不应继续依赖：

- 先写一个可能不完整的 view / node / field
- 再通过 `finalizeXxx` / `normalizeXxx` / `sanitizeXxx` 收尾

最终应变成：

- lower / builder / constructor 直接生成最终值

---

## 哪些代码应该直接删除

## 1. apply 后 whole-document normalize

应删除：

- `shared/mutation/src/engine/program/apply.ts` 中 entity create / patch / delete 路径上的 `input.normalize(...)`
- `applyEntityPatchEffect` 里的 patch 后 document normalize
- dataview engine 注入给 shared mutation runtime 的“写后 normalize”语义
- whiteboard engine 注入给 shared mutation runtime 的“写后 normalize”语义

保留的唯一 normalize 位置应是 load boundary，不再属于普通 write。

## 2. whiteboard legacy sanitize 主链路

应从主链路删除：

- `whiteboard/packages/whiteboard-core/src/document/sanitize.ts` 参与 runtime / engine / compile 的调用
- `whiteboard/packages/whiteboard-core/src/document/normalize.ts` 中“sanitize + assert”作为普通 write 后置步骤的语义

如果确认不再兼容历史脏文档，则应进一步：

- 直接删除 `sanitizeDocument`
- 删除相关“剥离 legacy 字段”的逻辑
- 删除“补系统尺寸”“重建 canvas.order”的迁移式修复逻辑

如果确实还要兼容外部旧文档，也只能保留在：

- import / migration / snapshot-upgrade 工具

不能回流到 runtime 主链路。

## 3. dataview compile 中的兜底 normalize

应逐步删除：

- `finalizeView(...)` 这类“先构造，再统一 normalize”的总装配兜底
- `search.state.normalize`
- `filter.state.normalize`
- `sort.rules.read.normalize`
- `calculation.view.normalize`
- `display.normalize`
- `options.normalize`
- `group.state.normalize`

这里不是说底层 state helper 一定全部消失，而是说：

- compile 主链路不应再依赖这些 helper 兜底修值
- next view 应直接按 canonical 结构构造出来

尤其像：

- kanban group 缺失后自动补默认 group

这种逻辑如果还要保留，也应变成：

- create handler 在创建时直接生成带合法 group 的 view

而不是先产生不完整 view，再 finalize。

## 4. 大部分 validate 代码

应删除的 validate 类型：

- shape validate
- 基础字符串非空 validate
- 宽松输入兜底 validate
- “就算传错了也给你 issue”式 validate
- 与类型系统重复的 validate
- 与 builder / constructor 保证重复的 validate
- 为兼容历史非 canonical 状态而存在的 validate

例如这类都应优先清理：

- field/view/node 基础 shape 检查
- 大量“字段存在吗、字符串非空吗、kind 对吗”的 compile 期重复判断
- 各种 finalize 后再 validate 的双重保障

原则上：

- typed internal path 不该反复检查“自己是不是自己”

---

## 哪些检查可以保留

只有极少数检查可以保留，而且保留原因必须非常具体。

## 1. shared apply 语义检查

这类可以保留：

- create 目标已存在时失败
- patch / delete 目标不存在时失败
- 不支持的 program step 直接失败
- 明确禁止的操作直接失败

这些不是 validate，而是执行语义的一部分。

## 2. 少数引用完整性检查

只有在不检查就会直接破坏结构时，才保留。

例如：

- 引用型操作指向不存在实体
- 删除实体会让核心引用悬空，而当前写入路径又没有同步修复

但这种检查也应尽量前移到 compile / builder，且数量应控制到最少。

## 3. 极少数不可由类型系统表达的核心 invariant

例如：

- 某类结构必须满足唯一性
- 某类有向关系必须满足最基本约束
- 某类关键集合不能进入自相矛盾状态

但保留标准必须非常严格：

- 不检查就会破坏核心数据结构
- 不能更早在构造时保证
- 无法通过更窄 API 设计消除

除了这类情况，默认删除。

---

## load boundary 还能保留什么

只有在“外部文档进入系统”时，才允许保留 normalize / assert / migration 逻辑。

允许存在的位置：

- engine 初始化接收外部 document
- `replace(document)` / `document.replace`
- collab checkpoint decode
- import / paste external snapshot
- 旧 schema 升级

但这里也要区分两类：

## 1. 仍然需要兼容旧数据

如果产品仍明确承诺兼容旧 snapshot / 外部导入：

- migration / sanitize / assert 可以保留

但必须放到：

- 单独 load/import/migration 边界

不能回流到普通 write。

## 2. 不再兼容旧数据

如果已经决定不再承接旧脏数据：

- legacy sanitize 不应只是迁移位置
- 应直接删除

这才是更干净的最终状态。

---

## 对当前代码的明确态度

## A. `applyEntityPatchEffect` 后的 normalize

明确应删。

不应保留任何“patch 完再 normalize document”的语义。

## B. whiteboard `sanitizeDocument`

明确不应继续存在于主链路。

如果没有明确 import / migration 兼容需求，应继续推进到直接删除。

## C. dataview `validateField` / `validateView`

当前仍然过重。

最终方向不是“继续精修 validate”，而是：

- 大幅删减
- 只留下极少数不可省略的 invariant / reference / execution checks

尤其不应继续保留这种模式：

- 构造 next state
- finalize / normalize
- validate
- 再写 program

这是一整套历史兜底模型，最终都应拆掉。

---

## 最终目标状态

## 1. shared mutation

最终状态：

- `apply(program)` 不接 `normalize`
- apply 只执行 program
- runtime 不在普通 commit 时修文档
- 只保留最小执行语义检查

## 2. dataview

最终状态：

- document write 主链路无 whole-document normalize
- view / field compile 直接产出 canonical state
- 不再依赖 `finalizeView(...)`
- 大部分 `validateField` / `validateView` 删除
- 只保留极少数引用与 invariant 检查

## 3. whiteboard

最终状态：

- document write 主链路无 sanitize
- node / edge / group / mindmap compile 直接产出 committed state
- `sanitizeDocument` 退出 runtime / engine / compile 主链路
- 如果无兼容需求，直接删除 legacy sanitize
- assert / migration 仅存在于 load/import 工具

---

## 推荐的改造顺序

1. 删除 shared mutation apply-time `normalize`，把 normalize 语义只留在 load boundary。
2. 断开 whiteboard runtime / engine / compile 对 `sanitizeDocument` 的主链路依赖。
3. 评估 whiteboard 是否还需要旧数据兼容；如果不需要，直接删除 legacy sanitize 代码。
4. 删除 dataview compile 中依赖 `finalizeView(...)` 的兜底式 canonicalize，改为 handler 直接构造 canonical view。
5. 系统性删除 dataview / whiteboard 中非必要 validate，只保留执行语义检查、少数引用完整性检查、极少数核心 invariant。
6. 将所有外部文档入口明确命名为 load/import/replace/snapshot-upgrade，集中承接剩余 assert / migration。

---

## 最终判断

这件事不应该停留在“把 normalize 从写路径挪到 load”。

更彻底的最终状态应该是：

- 普通 write 主链路 **零 sanitize**
- 普通 write 主链路 **零 whole-document normalize**
- 普通 write 主链路 **近零 validate**
- legacy 兼容逻辑 **要么隔离在 import/migration，要么直接删除**

推荐的判断标准也只有一句：

- **凡是不是执行语义必须的修复或校验，默认都不该存在于主链路。**

