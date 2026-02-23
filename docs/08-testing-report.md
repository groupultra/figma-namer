# Phase 2: 测试报告

## 测试策略
采用多层次测试金字塔：
1. **单元测试**: 每个模块的核心函数
2. **集成测试**: 模块间协作流程
3. **E2E Mock 测试**: 完整流程模拟

## 测试矩阵

### 单元测试
| 测试文件 | 覆盖模块 | 测试数 | 测试内容 |
|----------|----------|--------|----------|
| `traversal.test.ts` | Module A | 60 | DFS 遍历、过滤规则、默认名称检测、元数据提取、文本内容提取 |
| `renderer.test.ts` | Module B | 29 | Canvas 渲染、高亮框绘制、标签绘制、图片加载、Base64 导出 |
| `anti-overlap.test.ts` | Module B | 32 | 重叠面积计算、边界惩罚、能量函数、模拟退火优化器 |
| `vlm-client.test.ts` | Module C | 31 | API 调用流程、重试逻辑（5种HTTP码）、超时处理、AbortController、错误分类 |
| `prompt.test.ts` | Module C | 30 | CESPC 框架定义、globalContext 注入、平台处理、XML 结构 |
| `parser.test.ts` | Module C | 58 | JSON 提取（直接/markdown/嵌入文本）、键名归一化、置信度规范化、CESPC 验证、名称消毒 |

### 集成测试
| 测试文件 | 覆盖模块 | 测试数 | 测试内容 |
|----------|----------|--------|----------|
| `naming-api.test.ts` | Module E | 53 | CORS 策略、请求验证（14项）、速率限制、Claude/OpenAI 调用、JSON 提取、错误响应分类 |

## 结果

### 总览
```
 Test Files  7 passed (7)
      Tests  293 passed (293)
   Duration  ~14s
```

### 按模块统计
| 模块 | 测试数 | 状态 |
|------|--------|------|
| Module A: 节点遍历 | 60 | ✅ 全部通过 |
| Module B: SoM 渲染 | 61 (29+32) | ✅ 全部通过 |
| Module C: VLM 集成 | 119 (31+30+58) | ✅ 全部通过 |
| Module E: 后端 API | 53 | ✅ 全部通过 |
| **总计** | **293** | **✅ 全部通过** |

### 覆盖范围说明
- **单元测试**: 覆盖所有核心算法和纯函数（遍历、过滤、渲染、提示词构建、响应解析、重试逻辑）
- **集成测试**: 覆盖完整后端 API 流程（CORS → 验证 → 限速 → VLM 调用 → 响应格式化 → 错误处理）
- **Mock 策略**: Canvas API 使用 jsdom + 自定义 OffscreenCanvas mock；VLM API 使用 vi.mock 替换；fetch 使用 globalThis 替换
- **边界情况**: 包含空输入、超大输入、非法字符、网络超时、重试耗尽、并发限速等极端场景
