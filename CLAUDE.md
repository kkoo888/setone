# Project Agent Configuration

## Skills

本项目有 31 个技能，使用前先读 `skills/SKILLS-WORKFLOW.md` 了解协作工作流和触发词索引。

技能目录：`skills/`（含 31 个子目录，每个子目录是一个独立技能）

**匹配规则**：收到用户输入后，先查 `skills/SKILLS-WORKFLOW.md` 的「触发词索引」表，用关键词匹配技能。命中就用，没命中再看技能的 SKILL.md description。

## 开发规范

- 开发内容放在 `desktop/` 目录
- 提交到 `dev` 分支
- 变更记录写入 `desktop/dev-docs/`
