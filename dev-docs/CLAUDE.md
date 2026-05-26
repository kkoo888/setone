# Project Agent Configuration

## Skills

本项目有 32 个技能，使用前先读 `skills/SKILLS-WORKFLOW.md` 了解协作工作流和触发词索引。

技能目录：`skills/`（含 33 个子目录，排除 dev-env-setup 后 32 个技能）

**匹配规则**：收到用户输入后，先查 `skills/SKILLS-WORKFLOW.md` 的「触发词索引」表，用关键词匹配技能。命中就用，没命中再看技能的 SKILL.md description。

## 开发规范

- 开发内容放在 `desktop/` 目录
- 提交到 `dev` 分支
- 变更记录写入 `desktop/dev-docs/`
- 写代码时遵循 `karpathy-guidelines`：先想再写、最简优先、精准改动、目标驱动
