# Figma Namer - 项目总览报告

## 项目名称
**Figma Namer** - AI-Powered Semantic Layer Naming Tool
*"The Missing Pre-processor for Figma MCP"*

## 核心理念
利用多模态大模型（VLM）与 Set-of-Mark (SoM) 视觉提示词技术，自动为 Figma 设计稿的所有图层生成高精度语义化命名，
从根本上解决 Design-to-Code 流程中的"上下文断层"问题。

## 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Figma Desktop Client                      │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  Plugin Main Thread   │  │    Plugin UI (iframe)         │ │
│  │  (Figma Sandbox)      │  │    (React + Canvas)           │ │
│  │                        │  │                                │ │
│  │  ┌──────────────────┐ │  │  ┌──────────────────────────┐ │ │
│  │  │ Node Traversal   │ │  │  │ SoM Canvas Renderer      │ │ │
│  │  │ (Module A)       │ │  │  │ (Module B)               │ │ │
│  │  └──────────────────┘ │  │  │ + Anti-overlap Algorithm  │ │ │
│  │                        │  │  └──────────────────────────┘ │ │
│  │  ┌──────────────────┐ │  │                                │ │
│  │  │ Orchestrator     │ │  │  ┌──────────────────────────┐ │ │
│  │  │ (Module F)       │◄├──┤► │ VLM Client (Module C)    │ │ │
│  │  │ code.ts          │ │  │  └──────────┬───────────────┘ │ │
│  │  └──────────────────┘ │  │             │                  │ │
│  │                        │  │  ┌──────────┴───────────────┐ │ │
│  │  ┌──────────────────┐ │  │  │ React UI (Module D)      │ │ │
│  │  │ Name Rewriter    │ │  │  │ Preview + Confirm Panel  │ │ │
│  │  └──────────────────┘ │  │  └──────────────────────────┘ │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
│          ▲ postMessage ▼                    │ HTTP           │
└─────────────────────────────────────────────┼───────────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │  Vercel Edge API     │
                                    │  (Module E)          │
                                    │  /api/naming         │
                                    └──────────┬──────────┘
                                               │
                              ┌────────────────┼────────────────┐
                              ▼                                  ▼
                    ┌──────────────┐                   ┌──────────────┐
                    │ Claude API   │                   │ OpenAI API   │
                    │ (Sonnet 4)   │                   │ (GPT-4o)     │
                    └──────────────┘                   └──────────────┘
```

## 模块分解

| 模块 | 位置 | 运行环境 | 职责 |
|------|------|----------|------|
| Module A | `src/plugin/traversal/` | Figma Sandbox | 节点 DFS 遍历、噪点过滤、元数据提取 |
| Module B | `src/plugin/som/` | UI Iframe (Canvas) | SoM 视觉标记渲染、模拟退火防重叠 |
| Module C | `src/vlm/` | UI Iframe | VLM API 客户端、CESPC Prompt 工程、JSON 解析 |
| Module D | `src/ui/` | UI Iframe (React) | 全局上下文输入、命名预览/确认、批处理进度 |
| Module E | `backend/` | Vercel Edge | API 代理、API Key 安全、Claude/OpenAI 调用 |
| Module F | `src/plugin/code.ts` | Figma Sandbox | 全流程编排、消息路由、回写与清理 |

## 核心数据流
1. 用户选中 Frame → Module A 遍历收集元数据
2. Module F 导出根节点截图 → 发送给 UI
3. Module B 在 Canvas 上绘制 SoM 标记（红框+数字ID）
4. Module C 组装多模态 Prompt → Module E 代理调用 VLM
5. VLM 返回 CESPC 命名 JSON → Module C 解析验证
6. Module D 展示预览列表 → 用户确认
7. Module F 执行 node.name = newName 回写

## 开发进度追踪

| Phase | 状态 | 说明 |
|-------|------|------|
| Phase 0: 基础设施 | ✅ 完成 | 项目骨架、共享类型、构建系统 |
| Phase 1: 核心模块 (A-F) | ✅ 完成 | 6 个模块全部实现 |
| Phase 2: 测试 | ✅ 完成 | 293 个测试全部通过（240 单元 + 53 集成） |
| Phase 3: 审查 | ✅ 完成 | 代码审查 + 安全审计报告已生成 |
| Phase 4: 文档 | ✅ 完成 | 12 份模块报告 + UX 文档 |

## 命名框架: CESPC
**C**ontext - **E**lement - **S**tate - **P**latform - **M**odifier

示例: `Login Button - Disabled - Android - Primary`
