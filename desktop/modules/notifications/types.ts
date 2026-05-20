export interface NotificationRecord {
  id: string
  title: string
  body: string
  type: 'info' | 'success' | 'warning' | 'error'
  read: number
  createdAt: number
}
