# input 模块更新日志

## 2026-05-18

### 新增
- **MouseService 完整实现** — 通过系统命令实现鼠标控制
  - `getPosition()` — 获取鼠标当前位置
  - `move(x, y)` — 移动鼠标
  - `click(x, y, button)` — 点击鼠标（支持左/右/中键）
  - `doubleClick(x, y)` — 双击
  - `drag(from, to)` — 拖拽
  - `scroll(amount)` — 滚轮
- **KeyboardService 完整实现** — 通过系统命令实现键盘控制
  - `type(text)` — 输入文字
  - `pressKey(key)` — 按下单个键
  - `shortcut(keys)` — 执行快捷键组合
  - `keyDown(key)` / `keyUp(key)` — 按住/释放按键
- **平台支持** — Windows (PowerShell)、macOS (osascript)、Linux (xdotool)
- **按键映射** — 完整的通用按键名到各平台按键码映射

### 实现策略
1. 优先尝试动态加载 robotjs（如果已安装）
2. 降级到系统命令调用（child_process.execSync）
3. 都不可用时返回友好错误信息
