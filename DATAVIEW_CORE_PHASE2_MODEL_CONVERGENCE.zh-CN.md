# Dataview Core 第二阶段模型收敛方案

## 目标

这份文档只讨论 `dataview/packages/dataview-core` 下一阶段如何继续深度收敛。

目标不是继续零散地改几个函数名，而是：

- 先收底层模型
- 再让相似功能复用同一套模型
- 不允许相似功能各写各的局部 helper
- 如果现有底层模型不够，就先补底层模型，再改上层 API

默认前提：

- 不考虑兼容成本
- 可以直接改 public API
- 优先长期复杂度最低，而不是最小改动

## 扫描结果

这次对 `dataview/packages/dataview-core/src` 做了静态盘点，统计的是文件顶层 function-like 单元。

总体数据：

- 文件数：`69`
- 顶层函数：`581`
- 顶层对象方法：`24`
- 合计顶层 function-like 单元：约 `605`
- 带 `export` 的顶层函数：`236`

按目录看：

- `field/*`: `226`
- `document/*`: `65`
- `view/*`: `56`
- `filter/*`: `55`
- `operation/*`: `41`
- `calculation/*`: `40`
- `group/*`: `34`
- `commit/*`: `28`
- `search/*`: `22`
- `sort/*`: `14`

按文件看，当前最大的复杂度源头是：

- `field/kind/index.ts`: `60`
- `field/kind/date.ts`: `52`
- `filter/spec.ts`: `43`
- `operation/executeOperation.ts`: `38`
- `calculation/reducer.ts`: `22`
- `commit/impact.ts`: `22`
- `group/state.ts`: `20`
- `view/state.ts`: `18`
- `search/tokens.ts`: `15`
- `sort/state.ts`: `13`

结论非常明确：

- `view/group/search/sort/document` 第一轮 owner 化已经做得差不多
- 下一轮真正要打的是 `field/filter/calculation/operation/commit`
- 其中 `field` 是绝对第一优先级

## 核心结论

下一阶段最重要的事情不是继续“按模块收函数”，而是统一合并模式。

最重要的合并模式只有一句话：

**相似功能必须先对齐到底层模型，再对齐 API。**

也就是：

1. 先判断这是不是同一类状态模型
2. 再判断这是不是同一类集合模型
3. 再判断这是不是同一类 spec 模型
4. 再判断这是不是同一类变更模型
5. 如果答案是是，就不允许各写一份实现

反过来说：

- 不能因为文件不同，就各写一套 `clone / normalize / patch`
- 不能因为模块名不同，就各写一套 `rule list / add / replace / remove`
- 不能因为字段种类不同，就各写一套 `search / compare / group / parse`
- 不能因为 commit 目标不同，就各写一套 `collect touched / collect aspects / summarize`

## 第一原则：先补模型，再谈 API

很多重复实现，本质不是命名问题，而是底层没模型。

常见错误做法：

- 先在 `view` 加一套 patch
- 再在 `group` 加一套 patch
- 再在 `filter` 加一套 patch
- 最后发现三套逻辑高度相似，但已经散到不同文件里

正确顺序应该是：

1. 先定义公共模型
2. 再让上层 owner 复用这个模型
3. 最后只保留语义差异，而不是实现差异

## 必须统一的底层模型

## 1. 对象状态模型

这是现在最通用，也最值得继续推广的模型。

目标形态：

```ts
owner.state.clone(value)
owner.state.normalize(input)
owner.state.same(left, right)
owner.patch(value, patch)
```

已经比较接近这个模式的：

- `group`
- `search`
- `view.display`
- `view.options`

下一步应该扩到：

- `filter.state`
- `calculation.state`
- `field.option.state`

约束：

- `clone / normalize / same` 必须属于同一个 owner
- patch 必须是对象级 patch，不允许路径字符串
- 如果两个模块状态结构相似，优先共享 patch helper，而不是复制逻辑

推荐补一个内部公共模型：

```ts
state.clone.object(value)
state.same.record(left, right)
state.patch.object(current, patch)
state.patch.record(current, patch)
```

注意：

- 这是内部模型，不建议直接作为 public API 暴露
- public API 仍然应该走语义 owner

## 2. 规则集合模型

`sort` 已经证明这类模型是成立的，下一步应该推广。

目标形态：

```ts
owner.rule.clone(rule)
owner.rule.normalize(input)

owner.rules.clone(rules)
owner.rules.normalize(input)
owner.rules.same(left, right)
owner.rules.indexOf(rules, key)

owner.write.add(rules, ...)
owner.write.upsert(rules, ...)
owner.write.replace(rules, ...)
owner.write.remove(rules, ...)
owner.write.move(rules, ...)
owner.write.clear(rules)
```

这套模型下一步应该覆盖：

- `filter`
- `calculation` 的字段规则集合
- 可能还包括部分 `view.display.fields`

这里的重点不是名字，而是分层：

- `rule`: 单条规则
- `rules`: 规则数组
- `write`: 针对规则数组的写入

不应该继续混成一个文件里同时做三件事。

## 3. Spec 模型

这是下一阶段最值得补齐的底层模型。

目前 `field` 的复杂度高，根因不是字段多，而是：

- kind 行为分散
- option 行为分散
- date/status 特化行为分散
- 上层 API 再次重复拼装

真正长期最优的形态，不是继续堆更多 `field.xxx`，而是让可变行为尽量 spec 化。

目标形态：

```ts
spec.read(field)
spec.search(field, value)
spec.compare(field, left, right)
spec.group.meta(field, input)
spec.group.entries(field, value, input)
spec.group.domain(field, input)
spec.parse(field, draft)
spec.display(field, value)
```

这里不是说 public API 叫 `spec`，而是说底层必须有统一 spec 模型。

上层仍然可以是：

```ts
field.search.tokens(...)
field.compare.sort(...)
field.group.entries(...)
```

但这些都应该只是转发到统一 spec，而不是各自重写一遍。

换句话说：

- `field` 的上层 owner 保留
- `field` 的底层行为必须进一步 spec 化

### 对 `field` 的强约束

下面这些相似能力，必须共享同一套底层 spec：

- search
- compare
- group meta
- group entries
- group domain
- parse draft
- display
- default value

如果某类字段需要特化：

- 只能在 spec 分支里特化
- 不能在 `field/index.ts`、`field/spec.ts`、`field/kind/*`、`field/value/*` 多处各补一刀

## 4. 变更与影响模型

`commit/impact` 与 `operation/executeOperation` 现在已经 owner 化一轮，但底层模型还不够完整。

当前问题不是 owner 名称，而是：

- record / field / view 的变化收集模式高度相似
- touched / aspects / summary / hasXxx 分散实现
- `operation/executeOperation.ts` 仍然像一个超大分发文件

下一步应该补统一的变更模型：

```ts
change.set.add(set, value)
change.map.ensure(map, key, create)
change.membership.apply(change, itemId, before, after)
change.entry.apply(change, id, before, after, equal)
change.aspects.merge(set, aspects)
```

在这个底层模型之上，再长出：

```ts
impact.record.*
impact.field.*
impact.view.*
operation.exec.*
```

重点是：

- record / field / view 不应该重复写三套变更容器操作
- operation 不应该直接操作太多低层细节
- operation 先分发到 record / field / view executor，再由 executor 调 change 模型

## 5. 只读投影模型

`search.text.*`、`document.table.read.*`、`field.option.*`、`calculation` 部分读取逻辑，本质都是 projection/read。

虽然这一层没有前几层那么急，但长期还是应该统一：

```ts
read.one(...)
read.list(...)
read.ids(...)
read.map(...)
read.project(...)
```

注意，这个模型更适合做内部模块，而不是把 public API 都改成 `read.xxx`。

public API 仍然应该是：

- `document.table.read.*`
- `search.text.*`
- `field.option.*`

但底层读逻辑应该共享。

## 这一轮最重要的合并模式

如果只保留一条下一阶段的总规则，就是下面这条：

**相似功能优先复用“状态模型 / 规则集合模型 / spec 模型 / 变更模型”四类底层模型；如果复用不了，先补模型，禁止直接复制实现。**

这条规则要落到具体代码决策上：

### 可以直接复用时

- `sort` 和 `filter` 都是“规则集合”问题
- `group/search/filter` 都有“state + patch”问题
- `field` 的各种 kind 都是“spec 分派”问题
- `impact` 的 record/field/view 都是“变化聚合”问题

### 不能直接复用时

也不能马上复制实现，而是先问：

1. 现有模型是不是少了一层抽象
2. 这层抽象是不是可以内部化
3. 补完后能不能覆盖至少两个模块

只有这三个问题都是否，才允许局部特化实现。

## 各模块下一步建议

## 1. `field` 是第一优先级

涉及文件：

- `src/field/index.ts`
- `src/field/spec.ts`
- `src/field/kind/index.ts`
- `src/field/kind/date.ts`
- `src/field/kind/status.ts`
- `src/field/value/*`
- `src/field/options/*`

### 当前问题

- `field/index.ts` 仍然承担过多聚合职责
- `field/kind/index.ts` 仍然像总装配文件
- `kind/value/spec/options/date/status` 的行为边界还不够稳定
- 同一类行为在多个文件层重复转发甚至重复实现

### 下一步目标

把 `field` 收成“两层结构”：

1. 上层语义 owner
2. 下层统一 spec 模型

推荐最终 public API：

```ts
field.kind.*
field.schema.*
field.value.*
field.compare.*
field.search.*
field.group.*
field.option.*
field.date.*
field.status.*
field.spec.*
```

推荐底层内部模型：

```ts
fieldSpec.read(field)
fieldSpec.search(field, value)
fieldSpec.compare(field, left, right)
fieldSpec.group.meta(field, input)
fieldSpec.group.entries(field, value, input)
fieldSpec.group.domain(field, input)
fieldSpec.parse(field, draft)
fieldSpec.display(field, value)
```

### 预期收益

- `field` 目录函数数会显著下降
- 新增 field kind 时只改 spec，不改多层 helper
- search / compare / group 的长期复杂度会明显下降

## 2. `filter` 是第二优先级

涉及文件：

- `src/filter/index.ts`
- `src/filter/state.ts`
- `src/filter/spec.ts`
- `src/filter/types.ts`

### 当前问题

- state 与 rules 写入仍然偏平铺
- spec、rule、rules、write 还没有彻底分层
- 很多函数名仍然体现步骤，而不是职责

### 推荐最终 public API

```ts
filter.state.clone(...)
filter.state.normalize(...)
filter.state.same(...)

filter.rule.normalize(...)
filter.rule.defaultValue(...)
filter.rule.match(...)
filter.rule.spec(...)

filter.rules.clone(...)
filter.rules.normalize(...)
filter.rules.same(...)

filter.write.add(...)
filter.write.replace(...)
filter.write.remove(...)
filter.write.clear(...)
filter.write.mode(...)
filter.write.preset(...)
filter.write.value(...)
```

### 最关键的要求

`filter` 必须复用 `sort` 已验证过的“规则集合模型”，不允许再单独长一套风格不同的 rule list API。

## 3. `calculation` 是第三优先级

涉及文件：

- `src/calculation/reducer.ts`
- `src/calculation/capability.ts`
- `src/calculation/*`

### 当前问题

- field 级 calculation 能力与 collection 级 reduce 能力边界不够稳
- reducer 仍然偏步骤化
- capability 与 reducer 之间仍有重复语义

### 推荐方向

先补 calculation 底层模型，再重排 public API：

```ts
calculation.entry.*
calculation.collection.*
calculation.reduce.*
calculation.capability.*
calculation.view.*
```

### 合并原则

- 计算入口统一走 `entry`
- 多条记录聚合统一走 `collection`
- reducer 只做 reduce，不再兼做 capability 解释

## 4. `operation + commit` 第四优先级

涉及文件：

- `src/operation/index.ts`
- `src/operation/executeOperation.ts`
- `src/operation/reducer.ts`
- `src/commit/impact.ts`
- `src/commit/aspects.ts`

### 当前问题

- `operation/executeOperation.ts` 还是过于集中
- `commit/aspects.ts` 仍然是典型 helper 文件
- 变更容器和变化聚合没有完全模型化

### 推荐重构方向

把 operation 拆成按对象负责：

```ts
operation.exec.record(...)
operation.exec.field(...)
operation.exec.view(...)
operation.exec.external(...)
```

底层统一走：

```ts
change.membership.*
change.entry.*
change.aspects.*
```

然后 `impact` 只负责：

```ts
impact.record.*
impact.field.*
impact.view.*
impact.summary(...)
impact.has.*
```

### 关键要求

不要让 `operation/executeOperation.ts` 继续成为超大 if/switch 分发中心。

## 5. `view/group/search/sort/document` 下一轮只做内部下沉

这几块已经不再是主要瓶颈。

下一轮只建议做两件事：

- 把内部裸 helper 下沉到 owner 内部文件
- 尽量减少顶层散函数继续增长

不建议继续优先对这些模块做大规模 public API 重排。

## 实施顺序

推荐顺序必须是：

1. `field`
2. `filter`
3. `calculation`
4. `operation + commit`
5. `view/group/search/sort/document` 的内部 helper 下沉

原因很直接：

- 先打掉最大复杂度源头
- 再打掉跨模块重复模型
- 最后才做已经相对稳定模块的内部清扫

## 实施规则

从现在开始，任何新收敛都必须遵守下面这些规则：

### 1. 先找模型，再改模块

发现两个模块有相似逻辑时，先问：

- 它们是不是同一类状态
- 它们是不是同一类规则集合
- 它们是不是同一类 spec
- 它们是不是同一类变更聚合

如果是，就优先抽底层模型。

### 2. 不允许“平行 helper”

不允许出现这种演化方式：

- `field` 写一套
- `filter` 再仿一套
- `calculation` 再仿一套

这类重复是第二阶段必须彻底停止的。

### 3. 不允许 public API 泄漏实现步骤

不推荐：

- `buildXxx`
- `resolveXxxFromField`
- `collectXxxFromRules`

推荐：

- `state`
- `rule`
- `rules`
- `write`
- `spec`
- `entry`
- `collection`
- `change`

### 4. 如果底层模型只服务一个地方，就不要抽

不是所有重复都值得抽象。

底层模型至少要满足一个条件：

- 当前能覆盖两个以上模块
- 或者未来扩展时明显会复用

否则就维持局部实现。

## 最终判断

`dataview-core` 下一阶段还能继续明显收，但方向不能再是“继续把 API 名字变短”，而必须是“先把相似功能背后的模型统一掉”。

真正长期最优的路线是：

- 上层保留 owner 语义
- 下层统一状态模型
- 统一规则集合模型
- 统一 spec 模型
- 统一变更模型

如果这四类底层模型不补齐，后面即使 public API 看起来更整齐，内部也还会继续重复实现。

所以第二阶段的核心不是继续修表面，而是：

**用更少的底层模型，承载更多相似功能。**
