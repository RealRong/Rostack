# Dataview 剩余性能热点与长期最优方案

## 1. 目的

本文只回答当前阶段的三个问题：

1. 现在还慢在哪里
2. 哪些路径还值得继续优化
3. 如果继续按长期最优往下做，下一阶段应该怎么收

本文延续当前 dataview 重构的统一前提：

- 不保留兼容过渡
- 不保留第二套实现
- 不围绕历史实现做补丁式设计
- 优先选择长期最简单、最稳定、最好测、最好优化的结构


## 2. 当前最新 benchmark

基于 2026-04-10 最新实现，`large = 50k`，`iterations = 5`，`warmup = 2`，关键结果如下：

- `record.value.points.single`
  - `total = 8.237ms`
  - `commit = 0.026ms`
  - `index = 8.059ms`
  - `project = 0.090ms`
  - `publish = 0.006ms`
- `record.value.status.grouped`
  - `total = 16.111ms`
  - `commit = 0.014ms`
  - `index = 11.756ms`
  - `project = 4.310ms`
  - `publish = 0.004ms`
  - `sections = 2.722ms`
  - `nav = 0.989ms`
  - `changedStores = sections, appearances`
- `view.query.search.set`
  - `total = 4.137ms`
  - `commit = 0.045ms`
  - `index = 0.012ms`
  - `project = 4.062ms`
  - `publish = 0.003ms`
  - `query = 3.998ms`
  - `changedStores = search, records, sections, appearances`
- `view.query.sort.only`
  - `total = 8.856ms`
  - `commit = 0.049ms`
  - `index = 0.017ms`
  - `project = 8.765ms`
  - `publish = 0.004ms`
  - `query = 4.175ms`
  - `sections = 2.321ms`
  - `nav = 1.087ms`
  - `changedStores = sort, records, sections, appearances`
- `view.query.group.set`
  - `total = 11.840ms`
  - `commit = 0.058ms`
  - `index = 5.984ms`
  - `project = 5.761ms`
  - `publish = 0.004ms`
  - `sections = 4.608ms`
  - `nav = 1.109ms`
  - `changedStores = group, sections, appearances, calculations`

结论：

- `search.set` 已经不再是结构性问题
- `nav` 已经压到低位，不再是主瓶颈
- `publish` 已基本降到噪声级，`Object.is + 引用复用` 已经成立
- `sort.only` 的索引冷启动已经基本被消除
- `commit/document write` 已经不再占主路径
- 当前主要剩余热点集中在：
  - `sections`
  - `query / section rebuild`
  - `group index`
  - `history replay 下的 calc / section sync`


## 3. 已经基本解决的部分

### 3.1 search 冷启动问题已经解决

当前 `search` 已经改成：

- `recordId -> normalized search text`
- active view 常驻 search demand

这意味着：

- `view.query.search.set` 不再触发 search index 冷启动
- query 变更基本只剩 query 自身扫描和 publish 开销

继续压 `search` 只有两条路：

- 改搜索语义
- 引入更重的 substring index

在不改语义的前提下，当前收益空间已经明显变小。


### 3.2 nav 已经降到次要问题

`AppearanceList` 已经改成：

- 不再 eager 构建整张 `byId`
- 只保留 `ids / idsBySection / count`
- `Appearance` 按需解析
- 未变化项继续复用旧对象引用

现在 `nav` 在大多数关键场景下已经约 `1ms`。

继续抠 `nav` 的收益不会太高。


### 3.3 query.sort 已经不是主瓶颈

当前单字段排序已经走：

- `SortIndex.asc / desc`
- projection 单字段直通
- active view sort candidate 常驻预热
- touched-record 增量 reposition

因此：

- `query.sort` 自身已经明显变薄
- `sort.only` 的索引首建成本已经基本退出主路径


## 4. 当前最值得继续优化的地方

## 4.1 Sections 仍然是 projection 侧头号目标

当前 grouped 场景里，`sections` 仍然占据前排时间：

- `record.value.status.grouped`: `2.813ms`
- `view.query.group.set`: `4.608ms`
- `view.query.sort.only`: `2.321ms`

这说明 `sections` 虽然经过 phase1 已经更薄，但它仍然是 projection 侧最值得继续优化的点。当前剩余问题主要是：

- projection 里仍然自己维护 `byRecord`
- projection 里仍然自己维护 `idsByKey`
- grouped visible ids 仍然要在 projection 侧从 `query.visible` 再扫一轮
- grouped section state 还没有完全收敛成单层、最终可发布结构

### 长期最优方向

`sections` 应进一步收薄成：

- 只负责把 `query.visible / query.order` 映射到 section order 与 section visible ids
- 尽量不再负责 bucket descriptor 推导
- 尽量不再维护多份中间结构

### 推荐重构

1. 把 grouped descriptor 尽量前移到 `group index`
2. 单 bucket 字段不要继续常驻 `RecordId -> SectionKey[]`
3. `SectionState` 优先保留“发布直接可用”的结构，而不是先做 projection node 再二次 publish


## 4.2 Publish / Store Equality 已基本完成

phase2 完成后，这一层已经从主要问题变成基本解决：

- runtime 负责容器引用稳定
- project store 使用 `Object.is`
- publish 只做薄映射与上一轮容器复用

最新 benchmark 结果说明这一点已经成立：

- `record.value.status.grouped`: `publish = 0.005ms`
- `view.query.search.set`: `publish = 0.003ms`
- `view.query.sort.only`: `publish = 0.004ms`
- `view.query.group.set`: `publish = 0.004ms`

因此，这一层不再是后续阶段的主战场。剩余工作只需要保持两个约束：

- 新 projection 容器继续遵守引用稳定契约
- 组合视图层如果需要额外 memo，应明确放在 React 边界而不是 runtime/store

### 长期最优方向

把“引用稳定”从优化策略提升成硬契约：

- runtime/projection 负责稳定复用引用
- publish 层不再兜底深比较
- store 层尽量退回 `Object.is`

这会带来两个直接收益：

- 结构更简单
- 运行时更可预测


## 4.3 Sort 已基本完成，Group Index 仍有空间

当前：

- `view.query.group.set` 的剩余重点在 `group index`

这和之前不一样。现在不再是“projection 算法写错”，而是 index 本身已经成为首要成本。

### sort index 当前状态

phase4 完成后，`sort.only` 已经从：

- `index = 11.939ms`

下降到：

- `index = 0.017ms`

这说明：

- active view 的 sort candidate 预热已经生效
- `asc / desc` 首建不再落到 `sort.only` 主路径上
- 增量 reposition 已经足够覆盖 record value update 的常见场景

### group index 当前问题

当前 `group.set` 已经把 descriptor/order 下沉到 index，但 grouped 结构仍然保留：

- `recordBuckets`
- `bucketRecords`

而 `sections` 还会在上层继续把 `query.visible` 映射成每个 section 的 visible ids。

### 长期最优方向

1. `sort index`
   - 当前可以视为阶段性完成
   - 后续只需要继续观察高 churn 字段上的维护成本
2. `group index`
   - 对单归属字段继续压轻量结构
   - 如果还要继续降 `group.set`，下一步应减少 projection 侧 `idsByKey / byRecord` 维护成本


## 4.4 Document Write / Commit 已基本完成

phase5 完成后，这一层已经从主要问题降为基本解决。

最新结果：

- `record.value.points.single`: `commit = 0.026ms`
- `record.value.status.grouped`: `commit = 0.014ms`
- `history.undo.grouped.value`: `commit = 0.025ms`
- `history.redo.grouped.value`: `commit = 0.021ms`

这说明：

- document write 的整表复制已经退出主路径
- dispatch / undo / redo 的 commit 开销已经接近噪声
- 剩余大头重新回到 index / projection 同步，而不是 commit 本身

### 长期最优方向

1. 保持 document table 的持久化 overlay 语义，不再回到整表 spread
2. 后续如果还要继续压 replay，优先看 `calc` 与 `sections`，不是 commit 壳层
3. collector / inverse 继续遵守“只捕获必要信息，不二次深 clone”的约束


## 5. 当前不值得优先继续抠的地方

### 5.1 nav

已经基本到位，继续优化的边际收益很小。

### 5.2 search

现在 `search.set` 已经约 `5ms`，继续优化将明显提高复杂度，但收益有限。

### 5.3 calc

当前不再是头号热点，除非 benchmark 再出现新异常，否则优先级应后移。


## 6. 长期最优实施顺序

如果继续按“不留兼容过渡”的方式推进，建议顺序如下：

### Phase 1: Sections 收薄

状态：已完成

目标：

- 让 `sections` 不再维护多套重复中间结构
- 尽量让 grouped descriptor 前移到 `group index`
- 让 `toPublishedSections()` 尽量退化成轻量引用复用

完成标准：

- `SectionState` 更接近最终发布形态
- grouped 场景下 `sections` 成为明显更薄的一层

本轮实际落地：

- `published sections` 构建移入 `nav` 阶段，与 `appearances` 一起生成
- 删除 `runtime/sections.ts` 里的二次 `toPublishedSections()` 转换路径
- `buildPublishedSections()` 基于 `SectionState + AppearanceList` 直接产出最终发布数组
- section 未变化时复用上一轮 section 引用与 `ids`


### Phase 2: Publish / Store Equality 收紧

状态：已完成

目标：

- runtime 负责引用稳定
- publish/store 取消深比较兜底

完成标准：

- project store 大量回到 `Object.is`
- `sameSections / sameAppearanceList / sameFieldList / sameCalculationsBySection` 只保留 React 组合视图真正需要的地方

本轮实际落地：

- project store `set()` 等价判断回到 `Object.is`
- `RecordSet / AppearanceList / sections / calculations` 都在 runtime 内做引用复用
- adapter 发布阶段只做薄映射，优先复用上一轮 projection 容器
- 最新 benchmark 中 `publishMs` 已降到 `0.003ms ~ 0.005ms`
- `changedStores` 不再出现无关 store 的系统性抖动


### Phase 3: Group Index 再下沉

状态：已完成

目标：

- 单 bucket 字段走更轻结构
- descriptor/domain/meta 下沉到 index

完成标准：

- `group.set` 进一步下降
- `record.value.status.grouped` 的 index 与 sections 都继续变薄

本轮实际落地：

- `group index` 从“仅按 fieldId 缓存 bucket membership”改成“按 active group 配置缓存完整 group 变体”
- `bucket descriptor / domain / order` 下沉到 `group index`
- `sections` 不再自己解析 bucket domain、descriptor 与 section order，只消费 index 结果
- `view.query.group.set` 从 `total = 13.370ms` 下降到 `11.840ms`
- `record.value.status.grouped` 的 `project` 从 `4.180ms` 下降到 `3.950ms`


### Phase 4: Sort Index 再结构化

状态：已完成

目标：

- 把 `sort.only` 的剩余 `indexMs` 继续压缩

完成标准：

- 决定是：
  - active-view 常驻 sort index
  - 还是引入真正的增量 reposition 结构

本轮实际落地：

- active view 常驻 `display + current sort` 的 sort demand
- `sort index` 增加 touched-record 增量 reposition
- `view.query.sort.only` 从 `index = 11.939ms` 下降到 `0.017ms`
- `view.query.sort.only` 的总耗时从 `19.863ms` 下降到 `8.856ms`


### Phase 5: Commit / Document Write 重构

状态：已完成

目标：

- 压缩非 projection 路径的基础写入成本

完成标准：

- `record.value.*` 场景的 `commitMs` 明显下降

本轮实际落地：

- document table 改成持久化 overlay copy-on-write，不再对 `byId` 做整表 spread
- `records / views / customFields` 三类 entity table 统一到同一套 overlay 写语义
- `applyOperations` 去掉 redo 深 clone
- history inverse 去掉不必要的 `structuredClone` 与全量对象复制
- `record.value.status.grouped` 的 `commitMs` 从 `9.868ms` 下降到 `0.014ms`
- `record.value.status.grouped` 的总耗时从 `25.784ms` 下降到 `16.111ms`


## 7. 最核心的判断

当前系统已经过了“算法级错误非常明显”的阶段。

现在剩余的问题不再是：

- search index 设计完全错误
- nav eager materialization 完全错误
- calc sync 退化成灾难级复杂度

这些问题已经基本处理掉了。

当前真正的剩余复杂度集中在：

- `sections` 这一层仍在重复组装结构
- `group index` 还有继续压缩空间，但 `sort index` 已基本到位
- `history replay` 下 `calc / sections` 的同步仍然偏重

因此，下一阶段如果还要继续做“长期最优”，最值得继续动的不是 `search` 或 `nav`，而是：

1. `sections`
2. `group index`
3. `history replay 下的 calc / sections`
