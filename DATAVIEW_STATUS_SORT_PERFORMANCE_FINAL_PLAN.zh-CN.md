# Dataview Status Sort 性能优化最终清单

## 目标

- [ ] `status` 排序走预计算键
- [ ] `status` compare 不再分配 tuple
- [ ] `status` compare 不再扫描 options
- [ ] `status` compare 不再 clone options
- [ ] 删除不必要的 helper
- [ ] 删除所有中转层
- [ ] 保留现有语义不变

## 1. 直接删除

- [ ] 删除 `compareTuple`
- [ ] 删除 `status` compare 里的局部 tuple 构造
- [ ] 删除 `getStatusOptionRecord()`
- [ ] 删除 `getStatusOptionCategory()` 的动态推断链
- [ ] 删除 `readFieldOptionOrder()` 在热路径上的调用
- [ ] 删除 `readFieldOptions()` 在热路径上的调用
- [ ] 删除 `status` compare 中的 fallback 多分支链
- [ ] 删除 `status` 排序中的临时对象构造
- [ ] 删除 `status` 排序中的运行时别名推断

## 2. 直接保留

- [ ] 保留 `StatusField.options` 的 `EntityTable<..., ...>` 形态
- [ ] 保留 `options.byId`
- [ ] 保留 `options.ids`
- [ ] 保留 `defaultOptionId`
- [ ] 保留 `category`
- [ ] 保留 `order`
- [ ] 保留现有排序稳定性
- [ ] 保留现有空值尾置规则

## 3. 直接改造

- [ ] `status` 比较器改成单次 key 比较
- [ ] `status` 预计算 `sortScalar`
- [ ] `status` 预计算 `groupScalar`
- [ ] `status` 预计算 `displayScalar`
- [ ] `status` 预计算 `bucketKey`
- [ ] `status` 预计算 `bucketOrder`
- [ ] `status` 预计算 `categoryById`
- [ ] `status` 预计算 `orderById`
- [ ] `status` 预计算 `optionById`
- [ ] `status` 预计算结果直接挂到 field spec
- [ ] `status` 预计算结果直接挂到 sort index
- [ ] `status` 预计算结果直接挂到 bucket / group

## 4. 直接改文件

- [ ] [dataview/packages/dataview-core/src/field/kind/status.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/kind/status.ts:1)
- [ ] [dataview/packages/dataview-core/src/field/option.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/option.ts:1)
- [ ] [dataview/packages/dataview-core/src/field/kind/spec.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/kind/spec.ts:1)
- [ ] [dataview/packages/dataview-core/src/field/spec.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/field/spec.ts:1)
- [ ] [dataview/packages/dataview-engine/src/active/index/sort.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/index/sort.ts:1)
- [ ] [dataview/packages/dataview-engine/src/active/query/candidateSet.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/query/candidateSet.ts:1)
- [ ] [dataview/packages/dataview-core/src/mutation/compile/view.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/view.ts:1)

## 5. 直接删 helpers

- [ ] 删除所有只做 `readFieldOptions()` 包装的 helper
- [ ] 删除所有只做 option 查找的 helper
- [ ] 删除所有只做 category 推断的 helper
- [ ] 删除所有只做 order 查找的 helper
- [ ] 删除所有只做 sort tuple 构造的 helper
- [ ] 删除所有只做 status fallback 的 helper

## 6. 直接删中转层

- [ ] 删除 `status` compare 和 sort 之间的中转缓存函数
- [ ] 删除 `field.spec` 和 `status.ts` 之间的二次派发层
- [ ] 删除 `view.sort` 与 `field.compare.sort` 之间不必要的适配层
- [ ] 删除 query sort 的重复投影层
- [ ] 删除 bucket / group / sort 各自重复的 option 读取层

## 7. 直接收敛到单一来源

- [ ] `options.byId` 作为唯一 option lookup 来源
- [ ] `options.ids` 作为唯一 option 顺序来源
- [ ] `category` 作为唯一分组来源
- [ ] `order` 作为唯一稳定排序兜底来源
- [ ] `sortScalar` 作为唯一排序热路径来源
- [ ] `displayScalar` 作为唯一展示热路径来源

## 8. 直接补测试

- [ ] `status` compare 测试
- [ ] `status` sort 测试
- [ ] `status` bucket 测试
- [ ] `status` group 测试
- [ ] `status` default option 测试
- [ ] `status` 大量 options 性能回归测试
- [ ] `status` 大量 records 排序性能回归测试
- [ ] `status` 增量更新排序测试
- [ ] `status` 空值排序测试
- [ ] `status` 稳定性测试

## 9. 直接验收

- [ ] 排序路径不出现 `structuredClone`
- [ ] 排序路径不出现 tuple 分配
- [ ] 排序路径不出现 options 线性扫描热重复
- [ ] 排序路径不出现 category 运行时推断热重复
- [ ] 排序路径不出现中转层
- [ ] 排序路径只保留单一 canonical key

