/**
 * E2E 测试辅助 — 页面对象模型
 * @description 封装常见页面操作，提高测试可维护性
 */
import type { Page, Locator } from '@playwright/test'

/**
 * 聊天页面对象
 */
export class ChatPage {
  readonly page: Page
  readonly inputField: Locator
  readonly sendButton: Locator
  readonly messageList: Locator
  readonly loadingIndicator: Locator

  constructor(page: Page) {
    this.page = page
    this.inputField = page.locator('[data-testid="chat-input"]')
    this.sendButton = page.locator('[data-testid="chat-send"]')
    this.messageList = page.locator('[data-testid="message-list"]')
    this.loadingIndicator = page.locator('[data-testid="loading"]')
  }

  /** 发送消息 */
  async sendMessage(text: string): Promise<void> {
    await this.inputField.fill(text)
    await this.sendButton.click()
  }

  /** 等待 AI 回复 */
  async waitForResponse(timeout = 30000): Promise<string> {
    await this.loadingIndicator.waitFor({ state: 'hidden', timeout })
    const lastMessage = this.page.locator('[data-testid="message-assistant"]').last()
    await lastMessage.waitFor({ state: 'visible', timeout: 5000 })
    return (await lastMessage.textContent()) ?? ''
  }

  /** 获取所有消息 */
  async getMessages(): Promise<string[]> {
    return this.messageList.locator('[data-testid^="message-"]').allTextContents()
  }

  /** 获取消息数量 */
  async getMessageCount(): Promise<number> {
    return this.messageList.locator('[data-testid^="message-"]').count()
  }
}

/**
 * 设置页面对象
 */
export class SettingsPage {
  readonly page: Page
  readonly themeSelector: Locator
  readonly modelSelector: Locator
  readonly languageSelector: Locator
  readonly saveButton: Locator

  constructor(page: Page) {
    this.page = page
    this.themeSelector = page.locator('[data-testid="settings-theme"]')
    this.modelSelector = page.locator('[data-testid="settings-model"]')
    this.languageSelector = page.locator('[data-testid="settings-language"]')
    this.saveButton = page.locator('[data-testid="settings-save"]')
  }

  /** 导航到设置页面 */
  async goto(): Promise<void> {
    await this.page.click('[data-testid="nav-settings"]')
    await this.page.waitForSelector('[data-testid="settings-page"]')
  }

  /** 切换主题 */
  async setTheme(theme: 'light' | 'dark' | 'system'): Promise<void> {
    await this.themeSelector.selectOption(theme)
  }

  /** 设置模型 */
  async setModel(model: string): Promise<void> {
    await this.modelSelector.selectOption(model)
  }

  /** 保存设置 */
  async save(): Promise<void> {
    await this.saveButton.click()
  }
}

/**
 * 模块管理页面对象
 */
export class ModulesPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** 导航到模块页面 */
  async goto(): Promise<void> {
    await this.page.click('[data-testid="nav-modules"]')
    await this.page.waitForSelector('[data-testid="modules-page"]')
  }

  /** 获取模块列表 */
  async getModuleList(): Promise<string[]> {
    return this.page.locator('[data-testid^="module-item-"]').allTextContents()
  }

  /** 启用模块 */
  async enableModule(moduleId: string): Promise<void> {
    await this.page.click(`[data-testid="module-enable-${moduleId}"]`)
  }

  /** 禁用模块 */
  async disableModule(moduleId: string): Promise<void> {
    await this.page.click(`[data-testid="module-disable-${moduleId}"]`)
  }
}
