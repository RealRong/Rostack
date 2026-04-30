# Dataview Whiteboard Shared Final Audit And Last Rewrite Plan

## 目标

本文只回答三个最终问题：

- 当前 `shared` / `dataview` / `whiteboard` 的收口状态是否已经达到长期最优主干
- 还剩哪些必须继续重写的点
- 哪些边界已经正确，不应再继续下沉或重新抽象

本文只保留最终结论，不保留兼容层、过渡层、多套实现。

---

## 当前结论

当前主链路已经基本收口完成。

已确认通过：

- `pnpm --filter @shared/mutation typecheck`
- `pnpm -C dataview run typecheck:packages`
- `pnpm -C whiteboard run typecheck`

这说明当前不是“架构未闭合”，而是已经进入最后一轮长期最优审计阶段。

---

## 已经达到最终形态的部分

### 1. `shared/mutation` 已经成为唯一 structural canonical 底座

当前 `shared/mutation` 已经承接：

- ordered
  - `insert`
  - `move`
  - `splice`
  - `delete`
- tree
  - `insert`
  - `move`
  - `delete`
  - `restore`

并且：

- `emitMany` 已删除
- compile contract 只保留 `emit(...ops)`
- `splice` 已成为 first-class canonical ordered op

这部分不需要再改设计方向。

最终结论：

- `shared/mutation` 继续作为唯一 structural canonical runtime
- app 不应再围绕 ordered block move 重新发明第二套基础设施

### 2. `whiteboard` ordered 分层已经正确

当前白板链路的分层已经合理：

- `shared` 负责 canonical ordered `move` / `splice`
- `whiteboard-core` 负责领域语义
  - `canvas.order.move`
  - `group.order.move`
- `whiteboard-editor` 只保留命令级 `forward` / `backward` step planner

这是正确边界。

最终结论：

- planner 不属于 `shared`
- planner 不属于 `whiteboard-core`
- planner 只属于 `whiteboard-editor` 命令层
- `forward` / `backward` 不是 runtime primitive，只是 editor command

### 3. `whiteboard-react` / `editor-scene` 的 read contract 已经收口

当前运行时代码已经收口到：

- `scene.read.scene.*`
- `document.snapshot()`

而不是旧的：

- `scene.query.*`
- `document.get()`

这说明 `reader-first` 的方向在 whiteboard 侧已经成立。

最终结论：

- `read` 是最终 contract
- 不应再恢复另一套 `query` facade

### 4. `shared/projection` 已经是真正底座

当前 `dataview-engine` 和 `whiteboard-editor-scene` 都已经直接建立在 `@shared/projection` 上。

这意味着：

- 两边没有再各自维护第二套 projection runtime
- app 层只是在 shared projection 之上表达自己的 state / store / phase

最终结论：

- `shared/projection` 继续作为唯一 projection runtime 底座
- app 层允许有自己的 phase 组织，但不应再复制 shared projection 机制

### 5. `createWhiteboardCustomResult` 已经收缩到正确形态

当前 whiteboard custom result 已经收口为：

- `document`
- `delta`
- `footprint`
- `history`

不再保留此前那种多份 effects / extraFootprint / before document 的冗余输出。

最终结论：

- 这已经是正确的长期形态
- 不需要再把 custom result 拆回多套输出协议

---

## 明确不该再动的边界

### 1. `reader` 不属于 `shared/mutation` 的具体领域实现

`shared` 可以定义 generic reader contract，但不应该拥有：

- dataview document reader
- whiteboard document reader
- projection scene reader

原因很简单：

- reader 是 app/domain model 的读取协议
- shared 只应该约束 runtime 需要的抽象能力
- 不应该接管具体 document schema 的读取细节

最终结论：

- `shared` 提供 generic contract
- `dataview` / `whiteboard` 各自维护自己的 typed reader

### 2. `shared` 不应接管 `forward` / `backward`

`forward` / `backward` 的本质是命令语义，不是 structural canonical。

如果把它们下沉到 `shared`，会导致：

- mutation runtime 认识 editor command
- shared 重新长出 planner
- ordered primitive 和 UI command 混在一起

最终结论：

- 保留 `move`
- 保留 `splice`
- 不把 `forward` / `backward` 下沉到 shared

### 3. `shared` 不应试图 canonicalize 所有 custom op

不是所有 custom op 都应该变成 batch canonical op。

尤其不应该做：

- `tree.splice`
- `mindmap.topic.move` 直接退化成 shared batch primitive
- 把领域 orchestration 硬塞进 structural canonical

最终结论：

- ordered collection 用 `move` / `splice`
- tree 用 `insert` / `move` / `delete` / `restore`
- 更高层领域动作继续留在 app semantic 层

---

## 还必须继续重写的唯一核心区域

### `dataview` 的 `view.patch`

这是当前代码里最明显、也最应该继续清除的旧语义伞层。

当前虽然：

- `view.order.*` 已结构化
- `view.display.*` 已结构化

但仍然存在一个过大的 `view.patch`，承接：

- `name`
- `type`
- `search`
- `filter`
- `sort`
- `group`
- `calc`
- `display`
- `options`

这会带来三个长期问题：

#### 1. 语义粒度仍然过粗

`view.patch` 本质还是：

- 把多个正交语义打成一个 patch payload

这与已经完成结构化的：

- `view.order.move`
- `view.order.splice`
- `view.display.show`
- `view.display.hide`
- `view.display.move`
- `view.display.splice`

不一致。

#### 2. engine public API 仍然围绕 patch 组织

当前 active / views API 中大量写入仍然是：

- 先构造 `ViewPatch`
- 再执行 `view.patch`

这使上层仍然在拼 patch，而不是调用最终的 first-class intent。

#### 3. compile 层仍然承担 patch diff / repair / decomposition 负担

当前 `compile-view.ts` / `compile-field.ts` 仍然需要：

- 读 patch
- 合成 next view
- 再拆回较细粒度 op

这说明 public write contract 还没真正收口。

---

## `dataview` 的最终 API 方向

最终目标不是“继续保留一个更聪明的 `view.patch`”，而是删除它。

### 最终原则

- 上层不再直接构造 `ViewPatch`
- compile 层不再承担大范围 view diff
- 每一类稳定语义都应该有 first-class intent

### 建议的最终收口方向

以下不是过渡层，而是最终目标分类。

#### 1. view meta

- `view.rename`
- `view.type.set`
- `view.open`
- `view.remove`

#### 2. view search

- `view.search.set`

#### 3. view filter

- `view.filter.create`
- `view.filter.patch`
- `view.filter.move`
- `view.filter.remove`
- `view.filter.clear`
- `view.filter.mode.set`

#### 4. view sort

- `view.sort.create`
- `view.sort.patch`
- `view.sort.move`
- `view.sort.remove`
- `view.sort.clear`

#### 5. view group

- `view.group.set`
- `view.group.clear`
- `view.group.toggle`
- `view.group.mode.set`
- `view.group.sort.set`
- `view.group.interval.set`
- `view.group.showEmpty.set`

#### 6. view group bucket / section

- `view.section.show`
- `view.section.hide`
- `view.section.collapse`
- `view.section.expand`

#### 7. view calc

- `view.calc.metric.set`
- `view.calc.metric.clear`

#### 8. view layout options

这部分不应继续包成大 `view.patch.options`。

应按稳定领域语义拆成 first-class intent，例如：

- table layout
- gallery layout
- kanban layout

是否继续细拆到单字段级别，可以按领域稳定性决定；但无论如何，不再通过 `view.patch` 聚合承接。

### 明确结论

`view.patch` 不是最终 API。

它应该被完全删除，而不是保留为“万能兜底”。

---

## `dataview` 中不需要继续重写的部分

以下部分已经是正确方向：

- `field.option.move`
- `view.order.move`
- `view.order.splice`
- `view.display.move`
- `view.display.splice`
- `view.display.show`
- `view.display.hide`
- `view.display.clear`

这些能力已经体现出：

- ordered 语义 first-class 化
- 对 shared structural ordered 的直接复用

因此：

- 不应回退到 patch
- 不应再重新发明 target-order diff helper

---

## `whiteboard` 中只剩一个很小的 API 清洁问题

当前 `canvas.order.step()` / `group.order.step()` 在 planner 结果为空时，会发一个空的 `*.order.move` 来拿 `IntentResult`。

这不是架构错误，也不影响当前语义。

但从长期最优角度看，它不是最干净的 API 形态。

最终目标应是：

- write 层可以直接返回 typed noop result
- 而不是伪造一个空 intent

这是 API 清洁问题，不是 shared 设计问题，也不是当前必须优先处理的主任务。

优先级低于 `dataview view.patch` 删除。

---

## 最终优先级

### P0

删除 `dataview` 的 `view.patch` 体系，改成 first-class view intent families。

这是当前唯一还值得继续大改的核心区域。

### P1

清理 `whiteboard-editor` 的 `step()` 空计划 fallback，改成显式 noop result。

这属于 API 收尾，不影响主结构。

### P2

继续保持：

- `shared/mutation` 作为唯一 canonical mutation runtime
- `shared/projection` 作为唯一 projection runtime
- app reader 归属各自 domain
- planner 只留在 whiteboard editor command layer

这不是待改项，而是必须固化的最终边界。

---

## 最终结论

当前系统已经完成了大部分真正重要的 shared-first 重构。

已经可以明确认为：

- `shared/mutation` 的结构化能力方向是正确的
- `shared/projection` 的底座方向是正确的
- `whiteboard` 的 ordered / reader / projection 分层已经基本达到长期最优

最后还需要继续重写的核心，只剩 `dataview view.patch` 这一块。

因此后续执行应非常明确：

1. 不再扩张 shared 抽象范围
2. 不再回头补兼容层
3. 直接删除 `dataview view.patch`
4. 把 dataview view 写链路改成 first-class intent family

这将是这轮 shared-first 收口的最后一块核心重写。
