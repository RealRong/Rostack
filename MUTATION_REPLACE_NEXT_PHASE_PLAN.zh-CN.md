# Mutation Replace 下一阶段实施方案

## 1. 目标

这一阶段只解决一个核心问题：

- 去掉会污染底层 mutation 协议的 `entity.replace`
- 保留真正有价值的 `document replace` 与 leaf-level `replace`
- 把业务侧“整体替换一个复杂实体”的需求，收敛成业务层 diff + 标准 writes
- 补齐 `patch` 语义，避免“理论上要靠 patch，实际上 patch 表达不完整”

本阶段不做兼容，不保留双轨，不保留旧分支。

---

## 2. 结论

`replace` 不能一刀切全部删除。

应该删除的是：

- `shared/mutation` 底层 write 协议里的 `entity.replace`
- writer 上 singleton / table / map 的 `.replace(...)`
- 业务 change 聚合里所有 `write.kind === 'entity.replace'` 分支

应该保留的是：

- `engine.replace(document)`：它表达 reset / 外部文档替换
- `sequence.replace(...)`：它表达有序集合整体替换
- `dictionary.replace(...)`：它表达 map/dictionary 整体替换
- `tree.replace(...)`：它表达 tree 整体替换

判断标准很简单：

- 能直接成为稳定 write 语义边界的 `replace`，保留
- 会逼着下游去读 payload、猜哪些字段变了的 `replace`，删除

---

## 3. 当前问题

### 3.1 `entity.replace` 让下游必须读 payload

现在 dataview 和 whiteboard 的 change 聚合都还在做这类事情：

- 看到 `entity.replace`
- 再去检查 payload 里有没有 `title / type / meta / values`
- 或者有没有 `name / search / filter / calc / options / fields`
- 然后猜业务语义变化

这会导致：

- change 语义依赖手写字段枚举
- projection / index / collab 无法只靠正式 writes 工作
- 上游 writer 看起来简单，下游复杂度全面转移

### 3.2 现在的 `patch` 语义并不完整

当前 shared writer 的 object patch 有两个根本缺口：

1. `patchValue === undefined` 会被直接跳过  
   这意味着 patch 不能表达“显式清空 optional 字段”。

2. object patch 不支持 `table / map` 子节点  
   这意味着复杂实体的 replace 不能自然收敛到 patch。

所以不能简单地“删掉 replace，只剩 patch”，否则业务层会直接失能。

### 3.3 whiteboard 仍然强依赖 entity-level replace

whiteboard 当前大量 wrapper API 仍在做：

- `write.nodes.replace(id, node)`
- `write.edges.replace(id, edge)`
- `write.groups.replace(id, group)`
- `write.mindmaps.replace(id, mindmap)`

这类写法如果不改，shared/mutation 无法删掉 `entity.replace`。

### 3.4 dataview 的真正 replace 使用面其实很小

dataview 的核心写入基本已经是：

- `patch(json.diff(...))`
- `sequence.replace(...)`

因此 dataview 这一侧的重点不是“怎么保留 replace”，而是：

- 移除 change 里对 `entity.replace` 的兼容判断
- 继续把聚合变化建立在正式 writes 上

---

## 4. 最终状态

### 4.1 shared/mutation 最终只保留这几类正式 write

```ts
type MutationWrite =
  | { kind: 'field.set'; ... }
  | { kind: 'dictionary.set'; ... }
  | { kind: 'dictionary.delete'; ... }
  | { kind: 'dictionary.replace'; ... }
  | { kind: 'entity.create'; ... }
  | { kind: 'entity.remove'; ... }
  | { kind: 'entity.move'; ... }
  | { kind: 'sequence.insert'; ... }
  | { kind: 'sequence.move'; ... }
  | { kind: 'sequence.remove'; ... }
  | { kind: 'sequence.replace'; ... }
  | { kind: 'tree.insert'; ... }
  | { kind: 'tree.move'; ... }
  | { kind: 'tree.remove'; ... }
  | { kind: 'tree.patch'; ... }
  | { kind: 'tree.replace'; ... }
```

明确删除：

- `entity.replace`

### 4.2 writer 最终形态

```ts
writer.object.patch(...)

writer.table.create(id, value)
writer.table.remove(id)
writer.table.move(id, anchor)
writer.table(id).patch(...)

writer.map.create(id, value)
writer.map.remove(id)
writer.map(id).patch(...)

writer.sequence.insert(...)
writer.sequence.move(...)
writer.sequence.remove(...)
writer.sequence.replace(...)

writer.dictionary.set(...)
writer.dictionary.delete(...)
writer.dictionary.replace(...)

writer.tree.insert(...)
writer.tree.move(...)
writer.tree.remove(...)
writer.tree.patch(...)
writer.tree.replace(...)
```

明确删除：

- `writer.singleton.replace(...)`
- `writer.table.replace(id, value)`
- `writer.map.replace(id, value)`

### 4.3 `engine.replace(document)` 保留

这是 reset 级别能力，不是细粒度 mutation write。

它的语义仍然是：

- 直接替换当前 document
- 产生 `change.reset() === true`
- 清空 history 栈

这条线不能和 `entity.replace` 混为一谈。

---

## 5. shared/mutation 下一阶段要改的东西

### 5.1 删除底层 `entity.replace`

需要改动：

- `shared/mutation/src/writer/writes.ts`
- `shared/mutation/src/writer/createWriter.ts`
- `shared/mutation/src/internal/apply.ts`
- `shared/mutation/src/internal/inverse.ts`
- `shared/mutation/src/change/*`
- 所有测试

具体要求：

1. 从 `MutationWrite` union 中删除 `entity.replace`
2. 删除 writer API 中 entity-level `.replace(...)`
3. `apply.ts` 删除 `case 'entity.replace'`
4. inverse 不再生成 `entity.replace`
5. 所有引用 `write.kind === 'entity.replace'` 的逻辑全部清零

### 5.2 补齐 `patch` 的正式语义

这是本阶段 shared/mutation 最重要的工作。

#### 目标语义

object patch 必须按“键是否出现”解释，而不是按“值是否为 undefined”解释。

也就是说：

```ts
writer.node(id).patch({
  groupId: undefined
})
```

必须表示：

- 这个 key 被显式写入
- 如果该 field 是 optional，就清空它

而不是被 silently skip。

#### 必须完成的能力

1. optional field 支持显式清空  
   `field<T | undefined>` 或 `optional(field<T>())` 必须能通过 patch 表达 `undefined`

2. nested object patch 不再吞掉 `undefined`

3. patch 只负责 object / field 语义  
   不要求 patch 自动支持任意 table/map diff

#### 明确不做

本阶段不在 shared/mutation 里实现“万能 entity replace diff 引擎”。

原因：

- 复杂 replace 的 diff 依赖业务规则
- 放进 shared/mutation 会重新引入隐式协议
- 会把业务复杂度错误地下沉到通用层

### 5.3 收紧 writer 的职责

shared writer 只做两件事：

1. 提供 typed low-level writes
2. 提供正确的 patch lowering

不再负责：

- 复杂 entity 整体替换
- before/after 业务 diff
- 业务聚合 change 推理

### 5.4 保留 leaf replace，不做拆解

这一阶段不要强行把下面这些 replace 再拆成更细粒度 writes：

- `dictionary.replace`
- `sequence.replace`
- `tree.replace`

原因：

- 它们本身就是清晰边界
- 下游不需要再读 payload 猜字段语义
- 拆掉它们只会增加写入量和类型复杂度

### 5.5 补测试

shared/mutation 必须新增或重写这些测试：

1. optional field patch to undefined
2. nested object patch with undefined child
3. no `entity.replace` in generated writes
4. table/map patch + create/remove/move 的 apply/inverse 正确性
5. sequence/dictionary/tree replace 仍可正常 undo/redo
6. `engine.replace(document)` 的 reset 语义不变

### 5.6 完成标准

shared/mutation 本阶段完成后必须满足：

1. `MutationWrite` 中不再存在 `entity.replace`
2. writer public API 中不再存在 entity-level `.replace(...)`
3. optional clear 可以正式通过 patch 表达
4. `engine.replace(document)` 保留且行为不变
5. 所有业务层不再依赖 `entity.replace`

---

## 6. whiteboard 下一阶段要改的东西

whiteboard 是本阶段迁移量最大的一侧。

### 6.1 删除 whiteboard writer 中所有 entity-level replace 使用

需要清掉的写法包括：

- `write.nodes.replace(...)`
- `write.edges.replace(...)`
- `write.groups.replace(...)`
- `write.mindmaps.replace(...)`

对应 wrapper 需要改成：

- `patch`
- `create/remove`
- `sequence.replace`
- `tree.patch/tree.replace`

### 6.2 `createWhiteboardWriter.replace(document)` 不能再 lower 成 entity.replace

当前 document replace wrapper 是：

- 先对 root field set
- 再对 order replace
- 再对 nodes/edges/groups/mindmaps 做 create/remove/replace

这里的问题不在“有 document replace”，而在它内部仍然发 entity replace。

最终应改成：

1. root 字段走 `set` / `patch`
2. `order` 继续走 `sequence.replace`
3. collection 级别走：
   - 不存在 -> `create`
   - 已删除 -> `remove`
   - 已存在 -> 业务 diff 成 patch / sequence / tree writes

### 6.3 `document.replace` intent 要收口

whiteboard 现在有 compile handler：

- `document.replace`

并且它调用 `ctx.writer.replace(...)`。

下一阶段应收口成二选一，只保留一个正式方案：

#### 方案 A：删除 `document.replace` intent，外部直接调用 `engine.replace(document)`

适用场景：

- React 受控文档同步
- 外部加载完整 document
- resync / reset / snapshot restore

这是长期更干净的方案。

#### 方案 B：保留 `document.replace` intent，但内部改成 document diff compiler

适用场景：

- 必须复用 compile pipeline / issue / services

但即便保留 intent，也不能再调用 entity replace。

本阶段优先推荐方案 A。

### 6.4 edge patch 不能再靠“重建 next edge 再 replace”

当前 edge patch wrapper 会：

1. 先读当前 edge
2. 合成 `next: Edge`
3. 调 `write.edges.replace(id, next)`

下一阶段必须改成正式 diff：

- 普通 field 走 `patch`
- `labels` 走 patch 后的值写入
- `points` 走 patch 后的值写入

如果当前 schema 仍把 `labels` / `points` 当作 field 值保存，那么至少要做到：

- 不再通过整 edge replace
- 只改必要字段

### 6.5 group / node / mindmap patch 都要只走 patch

whiteboard 各类实体的“replace 现有实体”都要下沉为：

- `json.diff(before, after)` 风格 patch
- 必要时配合 sequence/tree specialized ops

其中：

- `node`：位置、尺寸、owner、style、data 等走 patch
- `group`：字段很少，直接 patch
- `mindmap`：layout 走 patch，tree 走 tree ops

### 6.6 whiteboard change 聚合删除 `entity.replace` 分支

whiteboard 变化聚合当前仍把 `entity.replace` 当成“全部 touched”。

下一阶段必须改成：

- 只根据正式 field / sequence / tree / create / remove writes 聚合
- 不再存在“整实体 replace -> 全量 touched”捷径

这样 `node.geometry / node.owner / edge.points / mindmap.structure` 才会真正只由正式 write 决定。

### 6.7 whiteboard 完成标准

1. `whiteboard-core/src/mutation/write.ts` 不再调用任何 entity-level replace
2. `document.replace` 不再通过 entity replace 实现
3. whiteboard change 聚合中不再存在 `entity.replace`
4. edge/node/group/mindmap 全部通过 patch/create/remove/tree/sequence 实现
5. 外部完整文档替换只走 `engine.replace(document)` 或等价 reset 路径

---

## 7. dataview 下一阶段要改的东西

dataview 这一侧不需要大规模保留 replace，重点是清理旧兼容心智。

### 7.1 删除 dataview change 中所有 `entity.replace` 分支

这是第一优先级。

需要删除的逻辑包括：

- record replace payload inspection
- view replace payload inspection

完成后 dataview change 只能根据这些正式 writes 推导：

- `field.set`
- `dictionary.set/delete/replace`
- `sequence.insert/move/remove/replace`
- `entity.create/remove`

### 7.2 保留 view/order/fields 的 sequence replace

下面这些写法是合理的，不应删除：

- `views(viewId).order.replace(ids)`
- `views(viewId).fields.replace(ids)`

原因：

- 它们表达的是完整顺序替换
- 下游只需要知道 sequence 变了
- 没有 path 猜测问题

所以 dataview 不需要为了“去 replace”而把这类逻辑拆成大量 move/remove/insert。

### 7.3 `field.replace` intent 继续保留，但只作为业务 convenience API

dataview 的 `field.replace` 现在本质已经是：

- 读取 current
- 组装 next
- `patch(json.diff(current, next))`

这条线是对的，可以保留。

但它的定位必须明确：

- 这是业务层 convenience intent
- 不是 shared/mutation 的底层 replace 能力

### 7.4 `field.option.write.replace` 改名

这个 helper 不是 mutation replace，只是：

- 把 option list 转成 field patch 的 helper

因此建议下一阶段顺手改名，例如：

- `replaceFieldOptions` -> `toFieldOptionsPatch`
- `field.option.write.replace` -> `field.option.write.toPatch`

目的：

- 避免和 mutation write `replace` 语义混淆
- 降低 API 心智负担

### 7.5 dataview change model 继续从 writes 推导，不回退到 before/after

dataview 下一阶段仍然应该坚持：

- change 只消费标准 writes
- 不引入 `(before, after) => handcrafted change`
- 复杂业务 convenience replace 先 lower 成 writes，再交给 change

### 7.6 dataview 完成标准

1. `dataview-core/src/mutation/change.ts` 不再判断 `entity.replace`
2. dataview change 只基于正式 writes 推导
3. `view.order` / `view.fields` 继续使用 `sequence.replace`
4. `field.replace` 只作为业务 convenience API 保留
5. option helper 改名，不再和 mutation replace 混淆

---

## 8. 实施顺序

推荐顺序如下。

### Phase 1：先改 shared/mutation

必须先做：

1. 删除 `entity.replace`
2. 补齐 patch 对 optional clear 的语义
3. 重写相关 apply / inverse / test

原因：

- 不先改 shared，业务层无法真正迁移
- 不先补 patch，whiteboard/dataview 迁移后会失去清空能力

### Phase 2：先切 dataview

原因：

- dataview 使用面更小
- 可以先验证 shared/mutation 的新边界是否足够
- 可以先清理 change payload inspection

完成项：

1. 删除 `entity.replace` 相关 change 逻辑
2. 保持 `field.replace -> patch(diff)` 模式
3. 保持 `sequence.replace` 在 fields/order 上的使用

### Phase 3：再切 whiteboard

原因：

- whiteboard 现有 wrapper replace 面积最大
- 需要最多业务级 diff 下沉
- 迁移完成后才能真正证明 shared/mutation 边界是稳定的

完成项：

1. 改 document writer
2. 改 entity writer wrapper
3. 改 document.replace intent / engine replace 边界
4. 改 change 聚合

---

## 9. 本阶段明确不做的事

下面这些不属于本阶段核心目标，不要混进来：

1. 通用 before/after diff runtime 下沉到 shared/mutation
2. 在 change model 里直接手工构造 `change`
3. 为了删除 replace 而拆掉 `sequence.replace`
4. collab conflict scope 重写
5. 新一轮 schema 形态改造
6. 重新设计 tree / sequence / dictionary 的 write 协议

本阶段只做一件事：

把“复杂实体整体替换”从底层正式协议中移除，同时把 patch 补成可正式承载业务 diff 的能力。

---

## 10. 验收清单

### shared/mutation

- `entity.replace` 已从 write union 删除
- writer 已无 entity-level replace
- apply / inverse / tests 全部同步
- patch 支持 optional clear
- `engine.replace(document)` 行为保持

### dataview

- change 中无 `entity.replace`
- `field.replace` 仍可用，但只 lower 到 patch
- `view.order` / `view.fields` 仍用 `sequence.replace`
- option helper 已改名

### whiteboard

- writer 中无 `nodes/edges/groups/mindmaps.replace`
- document replace 不再走 entity replace
- change 中无 `entity.replace`
- 整个 whiteboard 只用 patch/create/remove/sequence/tree/engine.replace

---

## 11. 最终原则

最终原则只保留三条：

1. reset 用 `engine.replace(document)`
2. leaf structure 可以有 `replace`
3. complex entity replace 不进入正式 write 协议

换句话说：

- `replace` 不是要被彻底消灭
- 但它必须待在正确的层级
- `entity.replace` 这一层必须被清掉
