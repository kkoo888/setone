import type { Logger } from '../../../src/main/types/logger'

/** 数据集分类 */
export type DatasetCategory = '百科评估' | '通用语料' | '指令对话' | '数学推理' | '专业领域' | '语音' | '视觉OCR'

/** 数据集信息 */
export interface DatasetInfo {
  id: string
  name: string
  category: DatasetCategory
  downloads: string
  size: string
  description: string
  url: string
  /** 适用于知识库的推荐级别：high / medium / low */
  relevance: 'high' | 'medium' | 'low'
  tags: string[]
}

/** 远程文档中的数据集（解析结果） */
export interface RemoteDatasetEntry {
  name: string
  url: string
  downloads: string
  size: string
  description: string
  category: string
}

/** 内置精选数据集目录（适合本地知识库使用的） */
const BUILT_IN_DATASETS: DatasetInfo[] = [
  // ── 百科评估 ──
  {
    id: 'modelscope/cmmlu',
    name: 'CMMLU（中文多学科问答）',
    category: '百科评估',
    downloads: '565k',
    size: '1.0 MB',
    description: '中文多学科问答数据集，涵盖 67 个学科，中文知识库首选',
    url: 'https://modelscope.cn/datasets/modelscope/cmmlu',
    relevance: 'high',
    tags: ['中文', '百科', '问答', '小文件']
  },
  {
    id: 'modelscope/mmlu',
    name: 'MMLU（多学科问答）',
    category: '百科评估',
    downloads: '1.4m',
    size: '158 MB',
    description: '多学科问答数据集，涵盖 57 个学科，英文百科常识首选',
    url: 'https://modelscope.cn/datasets/modelscope/mmlu',
    relevance: 'high',
    tags: ['英文', '百科', '问答']
  },
  {
    id: 'modelscope/bbh',
    name: 'BBH（高难度推理）',
    category: '百科评估',
    downloads: '89k',
    size: '64 KB',
    description: 'BIG-Bench Hard，23 个高难度推理任务',
    url: 'https://modelscope.cn/datasets/modelscope/bbh',
    relevance: 'medium',
    tags: ['推理', '高难度', '小文件']
  },
  {
    id: 'modelscope/wikitext',
    name: 'WikiText（百科文本）',
    category: '百科评估',
    downloads: '78k',
    size: '19 KB',
    description: 'WikiText 百科文本语料，用于语言模型训练和知识库填充',
    url: 'https://modelscope.cn/datasets/modelscope/wikitext',
    relevance: 'medium',
    tags: ['百科', '文本', '小文件']
  },

  // ── 指令对话 ──
  {
    id: 'AI-ModelScope/alpaca-gpt4-data-zh',
    name: 'Alpaca GPT4 中文指令',
    category: '指令对话',
    downloads: '284k',
    size: '30 MB',
    description: '中文指令微调数据，GPT-4 生成，学习助手核心数据集',
    url: 'https://modelscope.cn/datasets/AI-ModelScope/alpaca-gpt4-data-zh',
    relevance: 'high',
    tags: ['中文', '指令', 'GPT-4', '推荐']
  },
  {
    id: 'AI-ModelScope/COIG-CQIA',
    name: 'COIG-CQIA（中文开放指令）',
    category: '指令对话',
    downloads: '128k',
    size: '285 MB',
    description: '中文开放指令通用问答数据集，覆盖多种问答场景',
    url: 'https://modelscope.cn/datasets/AI-ModelScope/COIG-CQIA',
    relevance: 'high',
    tags: ['中文', '指令', '问答']
  },
  {
    id: 'swift/self-cognition',
    name: '自我认知数据集',
    category: '指令对话',
    downloads: '247k',
    size: '29 KB',
    description: 'AI 自我认知训练数据，可用于定制助手人格',
    url: 'https://modelscope.cn/datasets/swift/self-cognition',
    relevance: 'medium',
    tags: ['自我认知', '人格', '小文件']
  },

  // ── 数学推理 ──
  {
    id: 'modelscope/gsm8k',
    name: 'GSM8K（数学推理）',
    category: '数学推理',
    downloads: '415k',
    size: '6 KB',
    description: '小学数学应用题，8.5K 道题，测试数学推理能力',
    url: 'https://modelscope.cn/datasets/modelscope/gsm8k',
    relevance: 'medium',
    tags: ['数学', '推理', '小文件']
  },

  // ── 专业领域 ──
  {
    id: 'peopletech/Legal',
    name: '法律数据集',
    category: '专业领域',
    downloads: '157k',
    size: '404 MB',
    description: '法律领域专业数据，涵盖法规、案例等',
    url: 'https://modelscope.cn/datasets/peopletech/Legal',
    relevance: 'medium',
    tags: ['法律', '专业']
  },
  {
    id: 'qiaoyitong/docker_to_podman',
    name: 'Docker→Podman 技术文档',
    category: '专业领域',
    downloads: '97k',
    size: '—',
    description: 'Docker 迁移到 Podman 的技术文档',
    url: 'https://modelscope.cn/datasets/qiaoyitong/docker_to_podman',
    relevance: 'low',
    tags: ['技术', 'Docker', 'DevOps']
  },

  // ── 语音 ──
  {
    id: 'FunAudioLLM/funasr-demo',
    name: 'FunASR 语音识别演示',
    category: '语音',
    downloads: '586k',
    size: '4.9 MB',
    description: 'FunASR 语音识别演示数据集',
    url: 'https://modelscope.cn/datasets/FunAudioLLM/funasr-demo',
    relevance: 'low',
    tags: ['语音', 'ASR', '小文件']
  },

  // ── 视觉OCR ──
  {
    id: 'AI-ModelScope/LaTeX_OCR',
    name: 'LaTeX OCR 公式识别',
    category: '视觉OCR',
    downloads: '325k',
    size: '1.06 GB',
    description: 'LaTeX 公式 OCR 识别训练数据',
    url: 'https://modelscope.cn/datasets/AI-ModelScope/LaTeX_OCR',
    relevance: 'low',
    tags: ['OCR', 'LaTeX', '视觉']
  },

  // ── 通用语料（大文件，标 low relevance 提醒） ──
  {
    id: 'swift/chinese-c4',
    name: 'Chinese-C4（中文网页语料）',
    category: '通用语料',
    downloads: '118k',
    size: '21.3 GB',
    description: '大规模中文网页语料，去重清洗后的高质量数据',
    url: 'https://modelscope.cn/datasets/swift/chinese-c4',
    relevance: 'low',
    tags: ['中文', '大规模', '语料']
  },
  {
    id: 'opencsg/Fineweb-Edu-Chinese-V2.1',
    name: 'Fineweb-Edu 中文教育语料',
    category: '通用语料',
    downloads: '166k',
    size: '2.2 TB',
    description: '中文教育类网页，高质量语料，适合训练',
    url: 'https://modelscope.cn/datasets/opencsg/Fineweb-Edu-Chinese-V2.1',
    relevance: 'low',
    tags: ['中文', '教育', '超大']
  }
]

/**
 * 数据集目录服务
 * 管理内置数据集列表，支持从远程 Markdown 解析更多数据集
 */
export class DatasetCatalog {
  private readonly logger: Logger
  private remoteDatasets: DatasetInfo[] = []
  private lastRemoteUrl = ''

  constructor(logger: Logger) {
    this.logger = logger
  }

  /**
   * 获取所有数据集（内置 + 远程）
   * @param category - 可选分类筛选
   */
  getDatasets(category?: string): DatasetInfo[] {
    const all = [...BUILT_IN_DATASETS, ...this.remoteDatasets]
    if (category && category !== '全部') {
      return all.filter(d => d.category === category)
    }
    return all
  }

  /**
   * 获取所有分类
   */
  getCategories(): string[] {
    const cats = new Set(BUILT_IN_DATASETS.map(d => d.category))
    this.remoteDatasets.forEach(d => cats.add(d.category))
    return ['全部', ...Array.from(cats)]
  }

  /**
   * 根据 ID 获取数据集
   */
  getById(id: string): DatasetInfo | undefined {
    return [...BUILT_IN_DATASETS, ...this.remoteDatasets].find(d => d.id === id)
  }

  /**
   * 从远程 Markdown 文件解析数据集列表
   * 支持 GitHub blob URL 和 raw URL
   * @param url - Markdown 文件地址
   */
  async fetchFromMarkdown(url: string): Promise<{ added: number; total: number }> {
    // 转换 GitHub blob URL 为 raw URL
    const rawUrl = this.toRawUrl(url)
    this.logger.info(`正在从远程加载数据集目录: ${rawUrl}`)

    try {
      const response = await fetch(rawUrl)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const markdown = await response.text()

      const parsed = this.parseMarkdown(markdown)
      this.remoteDatasets = parsed.map((entry, idx) => ({
        id: `remote/${entry.name.replace(/[^a-zA-Z0-9-]/g, '_')}_${idx}`,
        name: entry.name,
        category: entry.category as DatasetCategory,
        downloads: entry.downloads,
        size: entry.size,
        description: entry.description,
        url: entry.url,
        relevance: 'medium' as const,
        tags: [entry.category, '远程导入']
      }))

      this.lastRemoteUrl = url
      this.logger.info(`远程数据集加载完成: ${this.remoteDatasets.length} 个`)

      return {
        added: this.remoteDatasets.length,
        total: BUILT_IN_DATASETS.length + this.remoteDatasets.length
      }
    } catch (err) {
      const msg = (err as Error).message
      this.logger.error(`远程数据集加载失败: ${msg}`)
      throw new Error(`加载失败: ${msg}`)
    }
  }

  /**
   * 获取上次加载的远程 URL
   */
  getLastRemoteUrl(): string {
    return this.lastRemoteUrl
  }

  /**
   * 将 GitHub blob URL 转换为 raw URL
   */
  private toRawUrl(url: string): string {
    // https://github.com/user/repo/blob/branch/path/file.md
    // → https://raw.githubusercontent.com/user/repo/branch/path/file.md
    const blobMatch = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/)
    if (blobMatch) {
      const [, owner, repo, branch, path] = blobMatch
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
    }
    return url
  }

  /**
   * 解析 Markdown 表格中的数据集
   * 格式：| # | [name](url) | downloads | size | description |
   */
  private parseMarkdown(markdown: string): RemoteDatasetEntry[] {
    const entries: RemoteDatasetEntry[] = []
    let currentCategory = '未分类'

    const lines = markdown.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()

      // 检测分类标题（## 开头的行）
      const categoryMatch = trimmed.match(/^#{1,3}\s*(.+)/)
      if (categoryMatch && !trimmed.startsWith('####')) {
        const catText = categoryMatch[1].trim()
        // 从标题中提取分类（去掉 emoji 和序号）
        const cleanCat = catText
          .replace(/^[\d.]+\s*/, '')
          .replace(/^[🏫📚💬🔢⚖️🤖🎤👁️🔧📊]+\s*/, '')
          .trim()
        if (cleanCat.length > 0 && cleanCat.length < 20) {
          currentCategory = cleanCat
        }
      }

      // 解析表格行：| # | [name](url) | downloads | size | description |
      const tableMatch = trimmed.match(/^\|\s*(\d+)\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|/)
      if (tableMatch) {
        const [, , name, url, downloads, size, description] = tableMatch
        entries.push({
          name: name.trim(),
          url: url.trim(),
          downloads: downloads.trim(),
          size: size.trim(),
          description: description.trim(),
          category: currentCategory
        })
      }
    }

    return entries
  }
}
