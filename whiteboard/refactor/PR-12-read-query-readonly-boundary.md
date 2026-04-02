# PR-12 设计文档：query/read 只读边界收口

## 背景

当前 read/query 部分接口直接暴露内部对象或引用，调用方存在误修改内部状态的风险。需要建立明确的只读边界。

## 目标

1. 将关键对外读取接口改为只读类型语义。
2. 在 read/query API 出口增加防御层，避免直接返回可变内部引用。
3. 不改变业务语义，仅收口可变性。

## 设计原则

1. 读接口应天然不可变。
2. 防御层放在 API 出口，不侵入 stage 内部实现。
3. 对热点路径采用浅防御（浅拷贝/浅冻结），平衡性能与安全。

## 文件落点

1. `packages/whiteboard-engine/src/types/instance/query.ts`
2. `packages/whiteboard-engine/src/types/instance/read.ts`
3. `packages/whiteboard-engine/src/runtime/read/api/query.ts`
4. `packages/whiteboard-engine/src/runtime/read/api/read.ts`

## 非目标

1. 不做全量深冻结。
2. 不重写 read stage 缓存结构。

## 验收标准

1. `query.doc.get` 返回只读文档副本。
2. `read.get.*` 返回值不再直接暴露内部 Map/Array/Object 引用。
3. 现有调用方无需改语义。

## 回滚方案

1. 移除 API 出口防御层，恢复旧返回行为。
