import { app, Menu, BrowserWindow, shell } from 'electron'

export function createAppMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    // macOS: 应用菜单
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const, label: `关于 ${app.name}` },
              { type: 'separator' as const },
              { role: 'services' as const, label: '服务' },
              { type: 'separator' as const },
              { role: 'hide' as const, label: `隐藏 ${app.name}` },
              { role: 'hideOthers' as const, label: '隐藏其他' },
              { role: 'unhide' as const, label: '显示全部' },
              { type: 'separator' as const },
              { role: 'quit' as const, label: `退出 ${app.name}` }
            ]
          }
        ]
      : []),
    // 文件
    {
      label: '文件',
      submenu: [
        isMac
          ? { role: 'close' as const, label: '关闭窗口' }
          : { role: 'quit' as const, label: '退出' }
      ]
    },
    // 视图
    {
      label: '视图',
      submenu: [
        { role: 'reload' as const, label: '重新加载' },
        { role: 'forceReload' as const, label: '强制重新加载' },
        { role: 'toggleDevTools' as const, label: '开发者工具' },
        { type: 'separator' as const },
        { role: 'resetZoom' as const, label: '实际大小' },
        { role: 'zoomIn' as const, label: '放大' },
        { role: 'zoomOut' as const, label: '缩小' },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const, label: '切换全屏' }
      ]
    },
    // 帮助
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: async () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) {
              win.webContents.send('show-about')
            }
          }
        },
        { type: 'separator' as const },
        {
          label: '反馈问题',
          click: async () => {
            await shell.openExternal('https://github.com/kkoo888/setone/issues')
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
