import BaseModal from './BaseModal'
import Button from './Button'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: string | React.ReactNode
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  isLoading?: boolean
  isDangerous?: boolean
  confirmButtonVariant?: 'primary' | 'danger'
}

export function ConfirmDialog({
  isOpen,
  onClose,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  isLoading = false,
  isDangerous = false,
  confirmButtonVariant = isDangerous ? 'danger' : 'primary',
}: ConfirmDialogProps) {
  const footer = (
    <div style={{ display: 'flex', gap: 'var(--space-3)', width: '100%' }}>
      <Button variant="secondary" onClick={onClose} disabled={isLoading}>
        {cancelText}
      </Button>
      <Button variant={confirmButtonVariant} onClick={onConfirm} isLoading={isLoading} fullWidth>
        {confirmText}
      </Button>
    </div>
  )

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={title} footer={footer}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        {typeof message === 'string' ? (
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>{message}</p>
        ) : (
          message
        )}
      </div>
    </BaseModal>
  )
}
