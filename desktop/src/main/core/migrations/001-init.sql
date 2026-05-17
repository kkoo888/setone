-- 001-init.sql: 基础表结构初始化
-- 版本: 1
-- 描述: 创建模块配置、事件日志、能力注册、事件总线等基础表
-- 回滚: DROP TABLE IF EXISTS events; DROP TABLE IF EXISTS global_config; DROP TABLE IF EXISTS capability_overrides; DROP TABLE IF EXISTS event_log; DROP TABLE IF EXISTS module_configs;

-- 模块配置存储（按模块隔离的键值配置）
CREATE TABLE IF NOT EXISTS module_configs (
    module_id   TEXT NOT NULL,
    key         TEXT NOT NULL,
    value       TEXT,               -- JSON 序列化的值
    updated_at  TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (module_id, key)
);
CREATE INDEX IF NOT EXISTS idx_module_configs_module ON module_configs(module_id);

-- 事件日志（用于审计和回放）
CREATE TABLE IF NOT EXISTS event_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_name  TEXT NOT NULL,
    source      TEXT,               -- 来源模块 ID
    payload     TEXT,               -- JSON 序列化的事件数据
    created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_event_log_name ON event_log(event_name);
CREATE INDEX IF NOT EXISTS idx_event_log_source ON event_log(source);
CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at);

-- 能力注册表（持久化用户覆盖）
CREATE TABLE IF NOT EXISTS capability_overrides (
    capability_name TEXT PRIMARY KEY,
    module_id       TEXT NOT NULL,
    enabled         INTEGER DEFAULT 1,
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- 全局配置键值对
CREATE TABLE IF NOT EXISTS global_config (
    key         TEXT PRIMARY KEY,
    value       TEXT,               -- JSON 序列化的值
    updated_at  TEXT DEFAULT (datetime('now'))
);

-- 事件总线持久化（跨模块事件写入，供 event_bus 集成测试及审计使用）
CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,
    payload     TEXT,               -- JSON 序列化的事件数据
    created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
