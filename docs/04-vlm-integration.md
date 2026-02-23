# Module C: VLM 集成与 Prompt 工程 报告

## 思路
Prompt 质量直接决定命名精度。需要构建结构化的多模态提示词：
- XML 标签封装避免指令混淆
- CESPC 命名框架严格约束输出格式
- Few-shot 示例引导模型理解期望
- 文本辅助信息防止 OCR 幻觉

## 模块结构
```
src/vlm/
├── index.ts     # 模块导出
├── prompt.ts    # CESPC Prompt 构建: buildSystemPrompt(), buildUserPrompt()
├── client.ts    # VLM API 客户端: VLMClient 类
└── parser.ts    # 响应解析: parseVLMResponse(), validateNaming()
```

## CESPC 命名框架
| 维度 | 定义 | 示例 |
|------|------|------|
| Context | 业务语境 | Login, Checkout, UserProfile |
| Element | UI 元素类型 | Button, TextField, Card |
| State | 交互状态 | Disabled, Hover, Error |
| Platform | 平台约束 (可选) | iOS, Android, Web |
| Modifier | 修饰补充 (可选) | Primary, Large |

## 过程

### 1. VLM 客户端 (`client.ts`)

`VLMClient` 类封装了与后端 API 代理的完整通信逻辑。

**高层 API** — `generateNamesForBatch(batch, globalContext, platform)`:
1. 从 batch 的 labels 和 nodes 中组装 `NodeSupplement[]`（markId、textContent、boundVariables、componentProperties）
2. 构建 `VLMRequest` 请求体（含 SoM 标记图 Base64、节点补充信息、上下文、平台、批大小）
3. 调用低层 `generateNames()`
4. 将 VLM 返回的 namings 按 markId 映射回 `NamingResult[]`

**重试机制** — `generateNames()` 实现 3 次尝试（MAX_ATTEMPTS = 3）的指数退避重试：
- 首次请求无延迟，后续重试延迟 = `min(BASE_DELAY_MS × 2^(attempt-1), MAX_DELAY_MS)` + ±20% 随机抖动
- BASE_DELAY_MS = 1000ms，MAX_DELAY_MS = 10000ms
- 仅对 RETRYABLE_STATUS_CODES（408, 429, 500, 502, 503, 504）和网络/超时错误重试
- 非可重试错误（如 401 认证失败）立即抛出

**超时控制** — `sendRequest()` 使用 `AbortController` + `setTimeout(120000ms)` 实现 120 秒请求超时。超时后抛出 `VLMClientError(code='TIMEOUT', retryable=true)`。

**错误分类** — 自定义 `VLMClientError` 类包含 `code`（HTTP_xxx / TIMEOUT / NETWORK_ERROR / API_ERROR）和 `retryable` 标志。

### 2. Prompt 工程 (`prompt.ts`)

**系统提示词** — `buildSystemPrompt(globalContext, platform)` 构建 XML 结构化的系统提示，包含 6 个顶层 XML 标签区块：

- `<role_definition>`: 定义角色为资深 UI/UX 架构师和前端组件化专家
- `<global_context>`: 注入用户输入的全局上下文 + 平台特定子句（iOS/Android/Web 各有不同的术语指导）
- `<naming_rules>`: 完整的 CESPC 命名框架定义——5 个维度（Context/Element/State/Platform/Modifier）各含 10+ 候选值示例，分隔符规则，容器/文本/图标/图片的特殊命名指南，PascalCase 约定
- `<few_shot_examples>`: 8 个正确示例（Good）+ 8 个错误示例（Bad）及其纠正版本
- `<anti_hallucination_notice>`: 反幻觉指令——要求 VLM 将 textContent 视为 ground truth，利用 boundVariables 和 componentProperties 辅助判断
- `<output_instruction>`: 严格的 JSON 数组输出格式约束（markId + name + confidence）

**用户提示词** — `buildUserPrompt(nodeSupplements)` 以 XML 格式编码每个节点的补充信息（`<node markId="N">`），包含 textContent、boundVariables、componentProperties 子标签。XML 特殊字符通过 `escapeXml()` 转义。

### 3. 响应解析器 (`parser.ts`)

`parseVLMResponse(rawText, expectedMarkIds)` 实现稳健的 VLM 输出解析：

1. **JSON 提取** — `extractJsonArray()` 处理三种场景：清洁 JSON、Markdown 代码围栏包裹（```json ... ```）、前后有杂文的 JSON。通过定位最外层 `[...]` 括号对提取
2. **替代键名归一化** — `isValidEntry()` 兼容 VLM 可能返回的不同键名：`markId` / `mark_id` / `id`，以及 `name` / `suggested_name`
3. **CESPC 验证** — `validateNaming()` 执行 5 项检查：长度范围（2-100 字符）、非法字符检测、结构检查（Context + Element 至少两词）、分隔符格式（` - ` 而非 `_` 或 `/`）、Figma 默认名检测
4. **置信度归一化** — `normalizeConfidence()` 处理数字（>1 时按百分比转换）、字符串、缺失值（默认 0.5）等多种输入
5. **名称清洗** — `sanitizeName()` 压缩空白、规范化破折号间距、截断到 100 字符

当 JSON 提取或解析失败时，返回空名称的降级结果（而非抛异常），保证流程不中断。

## 结果

模块 100% 完成。VLM 客户端 31 个测试 + Prompt 构建 30 个测试 + 响应解析 58 个测试，共 119 个单元测试全部通过。测试覆盖了重试逻辑（含指数退避和抖动验证）、超时触发、各 HTTP 错误码的可重试判定、系统提示词各段落完整性、平台特定子句切换、XML 转义正确性、JSON 提取的多种格式（清洁/围栏/混合文本）、替代键名归一化、CESPC 验证规则、置信度边界值处理、Figma 默认名检测。
