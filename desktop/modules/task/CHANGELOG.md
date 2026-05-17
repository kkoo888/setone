# task 模块更新日志

## 2026-05-18

### 新增
- **SQLite 持久化** — 通过 `context.db` 创建 `tasks` 和 `task_steps` 表
  - activate 时从数据库加载已有任务
  - 创建/更新/完成时自动写入数据库
  - 执行过程中每完成一步都更新数据库
- **AI 任务拆解** — `TaskPlanner.plan()` 接入 Ollama（通过 `context.ai`）
  - 提示词让 AI 返回结构化步骤列表（JSON 数组格式）
  - 自动解析 AI 返回的 markdown 代码块中的 JSON
  - 降级方案：AI 不可用时回退到简单拆解（按句号分割）
- **task_delete 工具** — 删除任务（包括数据库记录和步骤）
- **task_pause 工具** — 暂停执行中的任务
- **task_progress 工具** — 获取任务执行进度（总数/完成/失败/执行中/待执行/百分比）

### 修改
- **TaskPlanner** — `plan()` 和 `createTask()` 改为异步方法，支持 AI 拆解
- **TaskExecutor** — 新增暂停/恢复机制、步骤完成回调（用于持久化）
- **index.ts** — 重构为使用 SQLite 持久化，移除纯内存 Map 存储
