# PR-14 设计文档：kernel/history 统一使用 shared inversion

## 背景

在 `PR-13` 已抽出 shared inversion 后，需要确保 kernel 与 history 两条链路都以该实现为唯一来源，并形成清晰导出边界。

## 目标

1. kernel 与 core history 的逆推能力统一来源于 `kernel/inversion`。
2. 在 kernel 导出层暴露统一逆推构建能力，避免后续再产生平行实现。

## 文件落点

1. `packages/whiteboard-core/src/kernel/index.ts`

## 实现说明

1. 导出 `buildInverseOperations`，形成稳定单入口。
2. 不改变既有 `invertOperations` API。

## 验收标准

1. 外部或内部复用逆推时可直接使用 kernel 统一导出。
2. 不再新增重复 inversion switch。

## 回滚方案

1. 移除新增导出即可，不影响当前行为。
