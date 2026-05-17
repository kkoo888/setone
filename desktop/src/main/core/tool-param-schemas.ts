/**
 * 工具参数 Schema 映射表
 * 为每个模块工具定义 JSON Schema，让 LLM 知道该传什么参数
 *
 * 基于各模块 getCapabilities() 中的参数解构分析
 * @author 小茜
 * @date 2026-05-18
 */

/** JSON Schema 属性定义 */
interface SchemaProperty {
  type: string
  description: string
  enum?: string[]
  default?: unknown
  items?: { type: string }
}

/** 完整的工具参数 Schema */
export interface ToolParamSchema {
  type: 'object'
  properties: Record<string, SchemaProperty>
  required: string[]
}

/**
 * 工具参数映射表
 * key = 工具名称，value = 该工具的参数 JSON Schema
 */
export const TOOL_PARAM_SCHEMAS: Record<string, ToolParamSchema> = {
  // ──────────────────────────────────────────────
  // 📁 文件操作模块 (file)
  // ──────────────────────────────────────────────
  file_read: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '要读取的文件路径（绝对路径或相对于项目根目录的路径）' }
    },
    required: ['path']
  },
  file_write: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '要写入的文件路径' },
      content: { type: 'string', description: '要写入的文件内容' }
    },
    required: ['path', 'content']
  },
  file_list: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '要列出内容的目录路径' }
    },
    required: ['path']
  },
  file_watch: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '要监听变化的文件或目录路径' }
    },
    required: ['path']
  },

  // ──────────────────────────────────────────────
  // 🖥️ 桌面集成模块 (desktop-integration)
  // ──────────────────────────────────────────────
  notify: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '通知标题' },
      body: { type: 'string', description: '通知内容' }
    },
    required: ['title', 'body']
  },
  hotkey_register: {
    type: 'object',
    properties: {
      accelerator: { type: 'string', description: '快捷键组合，如 "CommandOrControl+Shift+A"' },
      action: { type: 'string', description: '触发时执行的动作标识' }
    },
    required: ['accelerator', 'action']
  },

  // ──────────────────────────────────────────────
  // 🖱️ 输入控制模块 (input)
  // ──────────────────────────────────────────────
  mouse_move: {
    type: 'object',
    properties: {
      x: { type: 'number', description: '鼠标目标 X 坐标' },
      y: { type: 'number', description: '鼠标目标 Y 坐标' }
    },
    required: ['x', 'y']
  },
  mouse_click: {
    type: 'object',
    properties: {
      x: { type: 'number', description: '点击位置 X 坐标' },
      y: { type: 'number', description: '点击位置 Y 坐标' },
      button: { type: 'string', description: '鼠标按键', enum: ['left', 'right', 'middle'], default: 'left' }
    },
    required: ['x', 'y']
  },
  keyboard_type: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '要输入的文本内容' }
    },
    required: ['text']
  },
  keyboard_shortcut: {
    type: 'object',
    properties: {
      keys: { type: 'array', description: '按键组合数组，如 ["ctrl", "c"]', items: { type: 'string' } }
    },
    required: ['keys']
  },

  // ──────────────────────────────────────────────
  // 🧠 记忆模块 (memory)
  // ──────────────────────────────────────────────
  memory_save: {
    type: 'object',
    properties: {
      content: { type: 'string', description: '要保存的记忆内容' },
      type: { type: 'string', description: '记忆类型', enum: ['short-term', 'long-term'], default: 'short-term' },
      tags: { type: 'array', description: '标签列表，便于后续检索', items: { type: 'string' } }
    },
    required: ['content']
  },
  memory_search: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词或语义查询' },
      limit: { type: 'number', description: '返回结果数量上限', default: 10 }
    },
    required: ['query']
  },
  memory_delete: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '要删除的记忆 ID' }
    },
    required: ['id']
  },
  memory_summarize: {
    type: 'object',
    properties: {
      items: { type: 'array', description: '要生成摘要的记忆条目列表', items: { type: 'object' } }
    },
    required: ['items']
  },

  // ──────────────────────────────────────────────
  // ⏰ 主动模块 (proactive)
  // ──────────────────────────────────────────────
  reminder_add: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '提醒 ID（可选，自动生成）' },
      title: { type: 'string', description: '提醒标题' },
      time: { type: 'string', description: '提醒时间（ISO 8601 格式或自然语言如"明天上午9点"）' },
      repeat: { type: 'string', description: '重复规则', enum: ['none', 'daily', 'weekly', 'monthly'], default: 'none' },
      enabled: { type: 'boolean', description: '是否启用', default: true }
    },
    required: ['title', 'time']
  },
  reminder_list: {
    type: 'object',
    properties: {},
    required: []
  },
  reminder_toggle: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '要切换状态的提醒 ID' }
    },
    required: ['id']
  },
  weather_check: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名称，如"北京"、"上海"' }
    },
    required: ['city']
  },
  weather_forecast: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名称' },
      days: { type: 'number', description: '预报天数（1-7）', default: 3 }
    },
    required: ['city']
  },
  weather_alert: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名称' },
      condition: { type: 'string', description: '提醒条件，如"rain"（下雨）、"high_temp"（高温）、"wind"（大风）' },
      threshold: { type: 'number', description: '阈值（如温度值），可选' },
      enabled: { type: 'boolean', description: '是否启用', default: true }
    },
    required: ['city', 'condition']
  },

  // ──────────────────────────────────────────────
  // 📸 屏幕模块 (screen)
  // ──────────────────────────────────────────────
  screen_capture: {
    type: 'object',
    properties: {
      display: { type: 'number', description: '显示器索引（0 为主显示器）', default: 0 }
    },
    required: []
  },
  screen_ocr: {
    type: 'object',
    properties: {
      image: { type: 'string', description: 'Base64 编码的图片（不传则截取当前屏幕）' }
    },
    required: []
  },
  screen_ocr_batch: {
    type: 'object',
    properties: {
      imageUrls: { type: 'array', description: '图片 URL 列表', items: { type: 'string' } }
    },
    required: ['imageUrls']
  },

  // ──────────────────────────────────────────────
  // 👁️ 视觉模块 (vision)
  // ──────────────────────────────────────────────
  vision_start: {
    type: 'object',
    properties: {
      fps: { type: 'number', description: '捕获帧率（每秒帧数）', default: 1 }
    },
    required: []
  },
  vision_stop: {
    type: 'object',
    properties: {},
    required: []
  },
  vision_analyze: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '分析提示词，如"描述画面内容"、"识别图中文字"' }
    },
    required: []
  },

  // ──────────────────────────────────────────────
  // 📋 任务模块 (task)
  // ──────────────────────────────────────────────
  task_create: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '任务标题' },
      description: { type: 'string', description: '任务详细描述' },
      priority: { type: 'string', description: '优先级', enum: ['low', 'medium', 'high'], default: 'medium' }
    },
    required: ['title']
  },
  task_execute: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: '要执行的任务 ID' }
    },
    required: ['taskId']
  },
  task_list: {
    type: 'object',
    properties: {},
    required: []
  },
  task_delete: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: '要删除的任务 ID' }
    },
    required: ['taskId']
  },
  task_pause: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: '要暂停的任务 ID' }
    },
    required: ['taskId']
  },
  task_progress: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: '要查询进度的任务 ID' }
    },
    required: ['taskId']
  },

  // ──────────────────────────────────────────────
  // 🔧 工具路由模块 (tools)
  // ──────────────────────────────────────────────
  tool_execute: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '要执行的工具名称' },
      params: { type: 'object', description: '工具参数（具体取决于目标工具）' }
    },
    required: ['name']
  },
  tool_list: {
    type: 'object',
    properties: {},
    required: []
  },
  tool_route: {
    type: 'object',
    properties: {
      intent: { type: 'string', description: '用户意图描述' }
    },
    required: ['intent']
  },

  // ──────────────────────────────────────────────
  // 📖 命令面板模块 (command-palette)
  // ──────────────────────────────────────────────
  palette_open: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '预填充的搜索关键词（可选）' }
    },
    required: []
  },
  palette_close: {
    type: 'object',
    properties: {},
    required: []
  },
  palette_search: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' }
    },
    required: []
  },
  palette_execute: {
    type: 'object',
    properties: {
      commandId: { type: 'string', description: '要执行的命令 ID' }
    },
    required: ['commandId']
  },
  palette_register_command: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '命令唯一 ID' },
      label: { type: 'string', description: '命令显示名称' },
      action: { type: 'string', description: '命令执行动作类型' },
      params: { type: 'object', description: '命令参数' }
    },
    required: ['id', 'label']
  },
  palette_list_commands: {
    type: 'object',
    properties: {},
    required: []
  },

  // ──────────────────────────────────────────────
  // 🌐 翻译模块 (translator)
  // ──────────────────────────────────────────────
  translate_text: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '要翻译的文本' },
      from: { type: 'string', description: '源语言代码（如 zh、en、ja），留空自动检测' },
      to: { type: 'string', description: '目标语言代码（如 en、zh、ja）' }
    },
    required: ['text', 'to']
  },
  translate_detect: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '要检测语言的文本' }
    },
    required: ['text']
  },
  translate_history: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: '返回记录数上限', default: 20 }
    },
    required: []
  },
  translate_favorites: {
    type: 'object',
    properties: {},
    required: []
  },

  // ──────────────────────────────────────────────
  // 📚 知识库模块 (knowledge-base)
  // ──────────────────────────────────────────────
  kb_import: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '要导入的文件或目录路径' },
      recursive: { type: 'boolean', description: '是否递归扫描子目录', default: true }
    },
    required: ['path']
  },
  kb_search: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '语义搜索查询' },
      limit: { type: 'number', description: '返回结果数上限', default: 5 }
    },
    required: ['query']
  },
  kb_list: {
    type: 'object',
    properties: {},
    required: []
  },
  kb_delete: {
    type: 'object',
    properties: {
      docId: { type: 'string', description: '要删除的文档 ID' }
    },
    required: ['docId']
  },
  kb_ask: {
    type: 'object',
    properties: {
      question: { type: 'string', description: '基于知识库的问题' },
      limit: { type: 'number', description: '参考文档片段数', default: 3 }
    },
    required: ['question']
  },

  // ──────────────────────────────────────────────
  // 🔄 工作流模块 (workflow)
  // ──────────────────────────────────────────────
  workflow_create: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '工作流名称' },
      description: { type: 'string', description: '工作流描述' },
      steps: { type: 'array', description: '步骤列表', items: { type: 'object' } },
      trigger: { type: 'object', description: '触发器配置（cron 表达式、事件或快捷键）' }
    },
    required: ['name', 'steps']
  },
  workflow_execute: {
    type: 'object',
    properties: {
      workflowId: { type: 'string', description: '要执行的工作流 ID' },
      input: { type: 'object', description: '执行时传入的变量（可选）' }
    },
    required: ['workflowId']
  },
  workflow_list: {
    type: 'object',
    properties: {},
    required: []
  },
  workflow_delete: {
    type: 'object',
    properties: {
      workflowId: { type: 'string', description: '要删除的工作流 ID' }
    },
    required: ['workflowId']
  },
  workflow_pause: {
    type: 'object',
    properties: {
      runId: { type: 'string', description: '要暂停的运行 ID' }
    },
    required: ['runId']
  },
  workflow_log: {
    type: 'object',
    properties: {
      workflowId: { type: 'string', description: '工作流 ID（可选，不传则返回所有日志）' },
      limit: { type: 'number', description: '返回日志条数', default: 20 }
    },
    required: []
  },
  workflow_templates: {
    type: 'object',
    properties: {},
    required: []
  },
  workflow_create_from_template: {
    type: 'object',
    properties: {
      templateId: { type: 'string', description: '模板 ID' },
      overrides: { type: 'object', description: '覆盖模板默认配置（可选）' }
    },
    required: ['templateId']
  },

  // ──────────────────────────────────────────────
  // 🎯 技能模块 (skill) — 暴露给 LLM 的工具
  // ──────────────────────────────────────────────
  skill_list: {
    type: 'object',
    properties: {},
    required: []
  },
  skill_create: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '技能名称' },
      description: { type: 'string', description: '技能功能描述' },
      tags: { type: 'array', description: '标签列表', items: { type: 'string' } }
    },
    required: ['name', 'description']
  },
  skill_refine: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '要优化的技能 ID' },
      instruction: { type: 'string', description: '优化指令，如"增加错误处理"、"改进提示词"' }
    },
    required: ['id', 'instruction']
  },
  skill_refine_analyze: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '要分析的技能 ID' }
    },
    required: ['id']
  },
  skill_delete: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '要删除的技能 ID' }
    },
    required: ['id']
  },
  skill_scan: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '要扫描的技能目录路径' }
    },
    required: ['path']
  },
  skill_stats: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '技能 ID（可选，不传返回全部统计）' }
    },
    required: []
  },
  skill_config: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '技能 ID' },
      config: { type: 'object', description: '要更新的配置项（可选，不传则返回当前配置）' }
    },
    required: ['id']
  },
  skill_trash_list: {
    type: 'object',
    properties: {},
    required: []
  },
  skill_trash_restore: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '要恢复的技能 ID' }
    },
    required: ['id']
  },
  skill_trash_empty: {
    type: 'object',
    properties: {},
    required: []
  },
  skill_trash_delete: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '要永久删除的技能 ID' }
    },
    required: ['id']
  },
  skill_export: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '要导出的技能 ID' },
      outputPath: { type: 'string', description: '导出文件路径（可选）' }
    },
    required: ['id']
  },
  skill_import: {
    type: 'object',
    properties: {
      archivePath: { type: 'string', description: '归档文件路径' }
    },
    required: ['archivePath']
  },
  skill_export_batch: {
    type: 'object',
    properties: {
      ids: { type: 'array', description: '要导出的技能 ID 列表', items: { type: 'string' } }
    },
    required: ['ids']
  },
  skill_import_batch: {
    type: 'object',
    properties: {
      archivePath: { type: 'string', description: '批量归档文件路径' }
    },
    required: ['archivePath']
  },
  skill_market_search: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' }
    },
    required: ['query']
  },
  skill_market_install: {
    type: 'object',
    properties: {
      skillId: { type: 'string', description: '市场中的技能 ID' }
    },
    required: ['skillId']
  },
  skill_install_url: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '技能安装 URL（GitHub 仓库或压缩包地址）' }
    },
    required: ['url']
  },
  skill_update_check: {
    type: 'object',
    properties: {},
    required: []
  },
  skill_update_run: {
    type: 'object',
    properties: {
      skillId: { type: 'string', description: '要更新的技能 ID' }
    },
    required: ['skillId']
  }
}

/**
 * 获取工具的参数 Schema
 * @param toolName - 工具名称
 * @returns 参数 Schema，未找到时返回空 schema
 */
export function getToolParamSchema(toolName: string): ToolParamSchema {
  return TOOL_PARAM_SCHEMAS[toolName] ?? {
    type: 'object',
    properties: {},
    required: []
  }
}
