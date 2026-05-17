-- 002-memory.sql: 记忆模块表结构
-- 版本: 2
-- 描述: 创建短期记忆、长期记忆和记忆摘要表
-- 注意: 表结构与 modules/memory/services/ 中的代码保持一致
-- 回滚: DROP TABLE IF EXISTS memory_summaries; DROP TABLE IF EXISTS long_term_memory; DROP TABLE IF EXISTS short_term_memory;

-- 短期记忆（对话上下文、临时状态）
CREATE TABLE IF NOT EXISTS short_term_memory (
    id          TEXT PRIMARY KEY,           -- UUID
    role        TEXT NOT NULL,              -- 'user' | 'assistant'
    content     TEXT NOT NULL,
    timestamp   INTEGER NOT NULL,           -- Date.now() 毫秒时间戳
    session_id  TEXT NOT NULL,
    summarized  INTEGER DEFAULT 0           -- 0=未摘要, 1=已摘要
);
CREATE INDEX IF NOT EXISTS idx_stm_session ON short_term_memory(session_id);
CREATE INDEX IF NOT EXISTS idx_stm_timestamp ON short_term_memory(timestamp);
CREATE INDEX IF NOT EXISTS idx_stm_session_ts ON short_term_memory(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_stm_unsummarized ON short_term_memory(session_id, summarized);

-- 长期记忆（持久化知识、用户偏好，支持向量检索）
CREATE TABLE IF NOT EXISTS long_term_memory (
    id          TEXT PRIMARY KEY,           -- UUID
    content     TEXT NOT NULL,
    embedding   BLOB,                       -- Float32Array 序列化的嵌入向量
    type        TEXT NOT NULL,              -- 'fact' | 'preference' | 'event'
    created_at  INTEGER NOT NULL,           -- Date.now() 毫秒时间戳
    metadata    TEXT                        -- JSON 扩展字段
);
CREATE INDEX IF NOT EXISTS idx_ltm_type ON long_term_memory(type);
CREATE INDEX IF NOT EXISTS idx_ltm_created ON long_term_memory(created_at);
CREATE INDEX IF NOT EXISTS idx_ltm_type_created ON long_term_memory(type, created_at);

-- 记忆摘要（定期压缩的对话摘要）
CREATE TABLE IF NOT EXISTS memory_summaries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL,
    summary         TEXT NOT NULL,
    message_count   INTEGER DEFAULT 0,      -- 摘要涵盖的消息数
    created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_summary_session ON memory_summaries(session_id);
