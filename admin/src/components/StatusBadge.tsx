interface StatusBadgeProps {
  status: string
}

const statusColors: Record<string, { bg: string; color: string; label: string }> = {
  queued: { bg: '#3a3d4a', color: '#9ca3af', label: 'Queued' },
  processing: { bg: '#1e3a5f', color: '#60a5fa', label: 'Processing' },
  completed: { bg: '#14532d', color: '#4ade80', label: 'Completed' },
  failed: { bg: '#7f1d1d', color: '#f87171', label: 'Failed' },
  active: { bg: '#14532d', color: '#4ade80', label: 'Active' },
  idle: { bg: '#3a3d4a', color: '#9ca3af', label: 'Idle' },
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const s = statusColors[status] || { bg: '#3a3d4a', color: '#9ca3af', label: status }
  const isProcessing = status === 'processing'

  return (
    <span
      className={`status-badge ${isProcessing ? 'status-processing' : ''}`}
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  )
}
