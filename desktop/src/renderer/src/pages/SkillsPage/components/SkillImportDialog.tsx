/**
 * 技能导入弹窗
 * 支持拖拽或选择 .tar.gz 归档文件，导入前显示扫描结果
 */
import React, { useState, useCallback, useRef, useEffect } from 'react'

/** 组件属性 */
interface SkillImportDialogProps {
  visible: boolean
  onClose: () => void
  onImported: () => void
}

/** 导入阶段 */
type ImportPhase = 'select' | 'scanning' | 'confirm' | 'importing' | 'done' | 'error'

/** 扫描结果数据 */
interface ScanData {
  safe: boolean
  warnings: string[]
  permissions: Array<{ permission: string; risk: string; note: string }>
}

/** 导入结果数据 */
interface ImportData {
  success: boolean
  skillId?: string
  skillName?: string
  error?: string
  warnings?: string[]
  scanResult?: ScanData
}

/**
 * 技能导入弹窗组件
 */
export function SkillImportDialog({ visible, onClose, onImported }: SkillImportDialogProps) {
  const [phase, setPhase] = useState<ImportPhase>('select')
  const [filePath, setFilePath] = useState<string>('')
  const [scanData, setScanData] = useState<ScanData | null>(null)
  const [importResult, setImportResult] = useState<ImportData | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /** 重置状态 */
  useEffect(() => {
    if (visible) {
      setPhase('select')
      setFilePath('')
      setScanData(null)
      setImportResult(null)
      setErrorMsg('')
      setIsDragOver(false)
    }
  }, [visible])

  /** 选择文件并扫描 */
  const handleFileSelect = useCallback(async (path: string) => {
    setFilePath(path)
    setPhase('scanning')

    try {
      const result = await window.electronAPI.invoke('skill:import', {
        archivePath: path
      }) as { success?: boolean; data?: ImportData; error?: string }

      if (result?.data?.scanResult) {
        setScanData(result.data.scanResult as ScanData)

        if (result.data.scanResult.safe) {
          setPhase('confirm')
        } else {
          setImportResult(result.data)
          setPhase('confirm')
        }
      } else if (result?.data) {
        // 直接导入成功（无扫描阶段）
        setImportResult(result.data)
        setPhase('done')
        onImported()
      } else {
        setErrorMsg(result?.error ?? '扫描失败')
        setPhase('error')
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }, [onImported])

  /** 通过系统对话框选择文件 */
  const handleBrowse = useCallback(async () => {
    try {
      const result = await window.electronAPI.invoke('dialog:openFile', {
        filters: [{ name: '归档文件', extensions: ['tar.gz', 'tgz'] }],
        properties: ['openFile']
      }) as { canceled?: boolean; filePaths?: string[] }

      if (!result?.canceled && result?.filePaths?.[0]) {
        await handleFileSelect(result.filePaths[0])
      }
    } catch {
      // dialog API 可能不可用，降级到文件输入
      fileInputRef.current?.click()
    }
  }, [handleFileSelect])

  /** 确认导入 */
  const handleConfirmImport = useCallback(async () => {
    setPhase('importing')

    try {
      const result = await window.electronAPI.invoke('skill:import', {
        archivePath: filePath
      }) as { success?: boolean; data?: ImportData; error?: string }

      if (result?.success && result.data) {
        setImportResult(result.data)
        setPhase('done')
        onImported()
      } else {
        setErrorMsg(result?.error ?? '导入失败')
        setPhase('error')
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }, [filePath, onImported])

  /** 拖拽处理 */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const path = (files[0] as unknown as { path?: string }).path
      if (path) {
        await handleFileSelect(path)
      }
    }
  }, [handleFileSelect])

  /** 文件输入变化 */
  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.[0]) {
      const path = (files[0] as unknown as { path?: string }).path
      if (path) {
        await handleFileSelect(path)
      }
    }
  }, [handleFileSelect])

  if (!visible) return null

  return (
    <div className='dialog-overlay' onClick={onClose}>
      <div className='dialog-panel' onClick={(e) => e.stopPropagation()}>
        <div className='dialog-header'>
          <h2>导入技能</h2>
          <button className='dialog-close' onClick={onClose}>✕</button>
        </div>

        <div className='dialog-body'>
          {phase === 'select' && (
            <div
              className={`import-dropzone ${isDragOver ? 'drag-over' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <span className='dropzone-icon'>📦</span>
              <p className='dropzone-text'>拖拽归档文件到此处</p>
              <p className='dropzone-hint'>支持 .tar.gz 格式</p>
              <button className='btn btn-secondary' onClick={handleBrowse}>
                选择文件
              </button>
              <input
                ref={fileInputRef}
                type='file'
                accept='.tar.gz,.tgz'
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
              />
            </div>
          )}

          {phase === 'scanning' && (
            <div className='dialog-progress'>
              <div className='progress-spinner' />
              <p>正在扫描归档文件...</p>
            </div>
          )}

          {phase === 'confirm' && (
            <>
              {scanData && !scanData.safe && (
                <div className='scan-warning'>
                  <span className='warning-icon'>⚠️</span>
                  <p>安全扫描发现以下问题：</p>
                  <ul>
                    {scanData.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {scanData?.safe && (
                <div className='scan-safe'>
                  <span className='safe-icon'>✅</span>
                  <p>安全扫描通过</p>
                </div>
              )}

              {scanData?.permissions && scanData.permissions.length > 0 && (
                <div className='scan-permissions'>
                  <h4>权限声明</h4>
                  {scanData.permissions
                    .filter((p) => p.risk !== 'low')
                    .map((p, i) => (
                      <div key={i} className={`perm-item perm-${p.risk}`}>
                        <span className='perm-name'>{p.permission}</span>
                        <span className='perm-risk'>{p.risk}</span>
                        <span className='perm-note'>{p.note}</span>
                      </div>
                    ))}
                </div>
              )}

              <p className='confirm-hint'>
                确认导入此技能吗？文件将被复制到技能目录。
              </p>
            </>
          )}

          {phase === 'importing' && (
            <div className='dialog-progress'>
              <div className='progress-spinner' />
              <p>正在导入技能...</p>
            </div>
          )}

          {phase === 'done' && importResult && (
            <div className='dialog-success'>
              <span className='success-icon'>✅</span>
              <p>导入成功！</p>
              {importResult.skillName && (
                <p className='import-detail'>技能：{importResult.skillName}</p>
              )}
              {importResult.warnings && importResult.warnings.length > 0 && (
                <div className='import-warnings'>
                  <p>注意事项：</p>
                  <ul>
                    {importResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {phase === 'error' && (
            <div className='dialog-error'>
              <span className='error-icon'>❌</span>
              <p>{scanData ? '扫描失败' : '导入失败'}</p>
              <p className='error-detail'>{errorMsg}</p>
            </div>
          )}
        </div>

        <div className='dialog-footer'>
          {phase === 'select' && (
            <button className='btn btn-secondary' onClick={onClose}>取消</button>
          )}
          {phase === 'confirm' && (
            <>
              <button className='btn btn-secondary' onClick={onClose}>取消</button>
              <button className='btn btn-primary' onClick={handleConfirmImport}>
                确认导入
              </button>
            </>
          )}
          {(phase === 'done' || phase === 'error') && (
            <button className='btn btn-primary' onClick={onClose}>关闭</button>
          )}
        </div>
      </div>
    </div>
  )
}
