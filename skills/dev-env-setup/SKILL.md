---
name: dev-env-setup
description: 开发环境一键初始化。在新机器上搭建 OpenClaw 开发环境时触发。自动安装基础技能、生成 SSH 密钥、克隆项目仓库、安装 GitHub 技能库、注册 OpenClaw 原生开发技能。
---

# 开发环境一键初始化

在新机器上完整搭建 OpenClaw + setone 项目开发环境。

## 执行流程

按以下顺序执行，每步完成后汇报状态。

### Phase 1 — 基础技能安装

用 clawhub 安装以下基础技能：
```bash
clawhub install skill-vetter --force
clawhub install self-improving-agent --force
clawhub install self-improving --force
clawhub install humanizer --force
clawhub install github --force
clawhub install ui-ux-pro-max --force
```

### Phase 2 — SSH 密钥生成

```bash
ssh-keygen -t ed25519 -C "用户名@github" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

**输出公钥给用户**，等用户确认已添加到 GitHub 后再继续。

### Phase 3 — 克隆项目仓库

```bash
cd <工作目录>
git clone git@github.com:kkoo888/setone.git
cd setone
git checkout dev
```

### Phase 4 — 安装 GitHub 技能库

克隆三个高质量技能仓库到项目的 skills/ 目录：
```bash
cd <项目目录>
git clone https://github.com/mattpocock/skills.git skills/mattpocock-skills
git clone https://github.com/vercel-labs/agent-skills.git skills/vercel-agent-skills
git clone https://github.com/obra/superpowers.git skills/superpowers
```

### Phase 5 — 注册 OpenClaw 原生开发技能

在 `~/.openclaw/skills/` 下创建以下技能目录和 SKILL.md：

#### 5.1 react-best-practices
- 触发：写/审/重构 React 组件
- 内容：Vercel 官方 React 规则 + 组合模式
- 关联：requirements-clarification / typescript-best-practices / code-review / svg-draw / polish

#### 5.2 typescript-best-practices
- 触发：写 TS 代码、定义类型
- 内容：类型设计、泛型、Electron 规范
- 关联：requirements-clarification / tdd-workflow / systematic-debugging / code-review / architecture-review

#### 5.3 tdd-workflow
- 触发：写测试、修 bug、新功能
- 内容：红-绿-重构循环，测试行为不测实现
- 关联：requirements-clarification / systematic-debugging / code-review / planning-and-execution

#### 5.4 systematic-debugging
- 触发：bug、测试失败、意外行为
- 内容：先找根因再修，禁止盲目打补丁
- 关联：tdd-workflow / code-review / architecture-review / planning-and-execution

#### 5.5 planning-and-execution
- 触发：制定计划、拆分任务
- 内容：从 spec 到实现的完整流程
- 关联：requirements-clarification / architecture-review / tdd-workflow / code-review

#### 5.6 code-review
- 触发：完成开发、合并前
- 内容：自我审查 + 子代理审查
- 关联：react-best-practices / typescript-best-practices / tdd-workflow / systematic-debugging

#### 5.7 requirements-clarification
- 触发：需求模糊、多种理解
- 内容：追问流程，确保理解正确再动手
- 关联：planning-and-execution / architecture-review / frontend-design / svg-draw

#### 5.8 architecture-review
- 触发：改善代码结构、重构
- 内容：模块深度分析、删除测试
- 关联：tdd-workflow / typescript-best-practices / code-review / planning-and-execution

### Phase 6 — 改造 svg-draw 技能

将 svg-draw 改为调用 Iconify API：
- API: `https://api.iconify.design/search?query=关键词&limit=20`
- 获取 SVG: `https://api.iconify.design/图标集:图标名.svg?width=24&height=24&color=%23333`
- 图标集推荐：material-symbols, tabler, heroicons, lucide, solar, iconpark

### Phase 7 — 验证

```bash
# 验证基础技能
ls ~/.openclaw/skills/{skill-vetter,self-improving-agent,self-improving,humanizer,github,ui-ux-pro-max}/SKILL.md

# 验证原生开发技能
ls ~/.openclaw/skills/{react-best-practices,typescript-best-practices,tdd-workflow,systematic-debugging,planning-and-execution,code-review,requirements-clarification,architecture-review,svg-draw}/SKILL.md

# 验证 GitHub 技能库
ls <项目目录>/skills/{mattpocock-skills,vercel-agent-skills,superpowers}/

# 验证 SSH
ssh -T git@github.com

# 验证 Iconify API
curl -s "https://api.iconify.design/search?query=home&limit=1"
```

## 每个 SKILL.md 的模板结构

```markdown
---
name: 技能名
description: 一句话描述。触发条件。
---

# 技能标题

参考来源：来源

## 触发场景
- 场景1
- 场景2

## 核心规则/流程
...

## 🔗 关联技能
- 条件 → 用 **技能名**

## 详细参考
- 原始文件路径
```

## 注意事项

- SSH 密钥生成后需要用户手动添加到 GitHub
- clawhub 安装的技能在 ~/.openclaw/skills/ 下
- GitHub 克隆的技能库在项目 skills/ 目录下（开发参考用）
- 原生开发技能在 ~/.openclaw/skills/ 下（自动触发用）
- 每个原生技能都包含「关联技能」章节，形成技能网络
