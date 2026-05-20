# QQ宠物 技术架构分析 & 借鉴方案

> 分析日期：2026-05-20
> 目的：从 QQ宠物 设计中提取可借鉴的思路，指导 Live2D5 桌面宠物开发

---

## 一、QQ宠物 整体架构

```
┌─────────────────────────────────────────────────┐
│                  QQ 客户端 (PC)                   │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ qqpet.exe │  │ QQ 主窗口 │  │ 聊天/消息模块 │  │
│  │ (独立进程) │  │          │  │              │  │
│  └─────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│        │              │               │          │
│   Flash OCX 控件   IPC 通信      消息通知       │
│   (透明渲染)     (进程间)       (事件触发)      │
└────────┬──────────────┴───────────────┴──────────┘
         │
    HTTP/AMF 轮询
         │
┌────────┴──────────────────────────────────────────┐
│              腾讯服务端集群                         │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────┐  │
│  │ 宠物服务器 │  │ 数据库    │  │ 计费/道具/活动  │  │
│  │ (状态计算) │  │ (MySQL)  │  │ (业务逻辑)     │  │
│  └──────────┘  └──────────┘  └─────────────────┘  │
└───────────────────────────────────────────────────┘
```

## 二、客户端技术栈

### 2.1 渲染层：Flash Player OCX 控件

- **嵌入方式**：C++ 宿主程序（qqpet.exe）通过 ActiveX/OCX 控件嵌入 Flash Player
- **透明窗口技术**：
  - `wmode="transparent"` 让 Flash 背景透明
  - C++ 窗口设置 `WS_EX_LAYERED` + `SetLayeredWindowAttributes` 实现不规则透明窗口
  - Flash 内容直接渲染到桌面上方，鼠标事件可穿透
- **动画方式**：精灵图帧动画（Sprite Sheet）
  - 每个动作/状态是一组预渲染的 PNG 序列帧
  - Flash ActionScript 控制帧播放、状态切换、动画过渡

### 2.2 通信层：HTTP 轮询 + AMF 协议

- **早期协议**：AMF（Action Message Format）二进制协议
  - Flash 原生支持 AMF 序列化/反序列化
  - 比 JSON 更紧凑，适合 2005 年的网络环境
- **轮询机制**：
  - 客户端定时（30s~60s）向服务端拉取宠物状态
  - 用户操作（喂食、洗澡、玩耍）即时上报

### 2.3 数据层：服务端主导

- 所有关键数据（属性、道具、等级）由服务端计算和存储
- 客户端只是"展示层"，不做游戏逻辑计算
- 防作弊：客户端无法修改宠物属性

## 三、核心游戏循环

```
时间流逝（服务端计算）
    ↓
属性衰减（饥饿↓、清洁↓、心情↓、健康↓）
    ↓
事件触发（生病、想睡觉、想玩耍、随机事件）
    ↓
通知客户端（HTTP 轮询获取最新状态）
    ↓
客户端展示（Flash 播放对应动画/气泡对话）
    ↓
用户互动（喂食/洗澡/玩耍/看病/喂药）
    ↓
上报服务端 → 更新属性 → 计算结果 → 返回新状态
    ↓
循环...
```

## 四、属性衰减系统

| 属性 | 衰减速度 | 影响 | 恢复方式 |
|------|----------|------|----------|
| 饥饿值 | 每小时 -N | 低于阈值 → 饥饿动画 | 喂食 |
| 清洁值 | 每小时 -N | 低于阈值 → 脏动画 | 洗澡 |
| 心情值 | 每小时 -N | 低于阈值 → 郁闷动画 | 玩耍/互动 |
| 健康值 | 饥饿+清洁过低时衰减 | 低于阈值 → 生病 | 看病/喂药 |
| 成长值 | 在线时长累积 | 达到阈值 → 升级 | 自动 |

**关键设计**：离线时也衰减（服务端计算），上线时一次性结算差值。

## 五、事件系统

- **定时事件**：生日、节日、周年纪念
- **触发事件**：属性低于阈值触发（饥饿→气泡"我饿了"）
- **随机事件**：捡到道具、遇到朋友、心情突变
- **社交事件**：好友宠物来访、结婚、生蛋

## 六、与 Live2D5 对比

| 维度 | QQ宠物 (2005) | Live2D5 (2026) |
|------|--------------|----------------|
| 渲染 | Flash Player OCX + 精灵图帧动画 | Cubism 5 SDK + WebGL 实时骨骼动画 |
| 窗口 | C++ Win32 不规则透明窗口 | Electron BrowserWindow + transparent |
| 动画 | 预渲染帧序列（.swf） | 实时骨骼驱动（.moc3 + 物理引擎） |
| 通信 | HTTP 轮询 + AMF | IPC（主进程↔renderer） |
| 数据 | 服务端主导，客户端纯展示 | 本地优先，可扩展服务端 |
| 状态机 | 简单属性阈值触发 | 可扩展状态机 + AI 调度 |
| 交互 | 点击菜单（喂食/洗澡等） | 拖拽/点击 + AI 对话 |

## 七、借鉴方案

### 7.1 P0：属性衰减 + 状态机（核心生命感）

**设计思路**：本地存储属性，定时衰减，属性变化触发状态切换和动画。

```typescript
// 属性定义
interface PetAttributes {
  hunger: number      // 饱腹 0-100，随时间降低
  mood: number        // 心情 0-100，长时间不互动降低
  cleanliness: number // 清洁 0-100，随时间降低
  health: number      // 健康 0-100，饥饿/清洁过低时衰减
  intimacy: number    // 亲密度 0-1000，互动增加
  level: number       // 等级，亲密度累积升级
}

// 状态机
type PetState = 'idle' | 'hungry' | 'dirty' | 'lonely' | 'happy' | 'sleepy' | 'sick'

// 衰减规则
const DECAY_RULES = {
  hunger: { rate: -2, interval: 3600 },      // 每小时-2
  mood:   { rate: -1, interval: 3600 },      // 每小时-1
  cleanliness: { rate: -3, interval: 3600 }, // 每小时-3
}

// 状态判定
function determineState(attrs: PetAttributes): PetState {
  if (attrs.health < 30) return 'sick'
  if (attrs.hunger < 20) return 'hungry'
  if (attrs.cleanliness < 20) return 'dirty'
  if (attrs.mood < 20) return 'lonely'
  if (attrs.mood > 80) return 'happy'
  // 时间判定（22:00-6:00 为 sleep）
  const hour = new Date().getHours()
  if (hour >= 22 || hour < 6) return 'sleepy'
  return 'idle'
}
```

**离线差值计算**：
```typescript
function applyOfflineDecay(lastSaveTime: number, attrs: PetAttributes): PetAttributes {
  const elapsed = (Date.now() - lastSaveTime) / 1000 // 秒
  const hours = elapsed / 3600
  return {
    ...attrs,
    hunger: Math.max(0, attrs.hunger + DECAY_RULES.hunger.rate * hours),
    mood: Math.max(0, attrs.mood + DECAY_RULES.mood.rate * hours),
    cleanliness: Math.max(0, attrs.cleanliness + DECAY_RULES.cleanliness.rate * hours),
  }
}
```

### 7.2 P0：气泡对话系统（AI 驱动）

**传统方式**：固定文案（"我饿啦~"）
**我们的方式**：AI 根据宠物状态 + 上下文生成自然语言

```
宠物状态 + 用户历史 → AI Prompt → 生成对话 → 气泡展示

示例 Prompt：
"你是一只可爱的桌面宠物，当前状态：饥饿(15/100)、心情(80/100)、
 亲密度(500/1000)。主人已经3小时没理你了。
 请用简短可爱的一句话表达你的心情（20字以内）。"

输出："主人，我肚子咕咕叫了...🥺"
```

### 7.3 P1：事件触发动画

```typescript
// 事件触发器
const TRIGGERS = {
  hunger_low: {
    condition: (attrs) => attrs.hunger < 20,
    action: 'play_motion:hungry',
    bubble: '我好饿呀~',
    cooldown: 1800 // 30分钟内不重复触发
  },
  mood_high: {
    condition: (attrs) => attrs.mood > 80,
    action: 'play_motion:dance',
    bubble: null, // 开心时不需要说话，跳舞就好
    cooldown: 3600
  },
  long_absent: {
    condition: (_, lastInteraction) => Date.now() - lastInteraction > 86400000,
    action: 'play_motion:sad',
    bubble: '你终于回来了，我好想你...',
    once: true
  }
}
```

### 7.4 P2：亲密度 / 成长系统

- 亲密度随互动增加（喂食+5、玩耍+10、对话+3）
- 达到阈值解锁新表情/动作
- 成长阶段：幼年 → 成年 → 不同外观

### 7.5 P3：装扮系统

- Cubism 5 支持参数控制部位显示/隐藏
- 可切换服装、配件、发型

### 7.6 P4：社交互动

- 局域网/互联网宠物互访
- 宠物之间打招呼、互动动画
- AI 驱动的社交对话

## 八、技术实现路径

| 阶段 | 功能 | 技术方案 | 预估工时 |
|------|------|----------|----------|
| Phase 1 | 属性系统 + 状态机 | Zustand store + localStorage | 2天 |
| Phase 2 | 气泡对话 + AI | IPC 调用 AI 模块 | 2天 |
| Phase 3 | 事件触发动画 | 状态机 + motion group | 2天 |
| Phase 4 | 亲密度/成长 | 数据持久化 + 等级解锁 | 3天 |
| Phase 5 | 装扮系统 | Cubism 参数控制 | 3天 |
| Phase 6 | 社交互动 | 网络通信 + 多实例 | 5天 |

## 九、总结

QQ宠物的"灵魂"是 **属性衰减 + 事件触发 + 情感表达** 这套循环。技术过时了但设计思路不过时。

我们用 Cubism 5 的实时骨骼动画替代精灵图、用 AI 对话替代固定台词、用本地状态机替代服务端轮询，就是 **2026 版的 QQ 宠物**。
