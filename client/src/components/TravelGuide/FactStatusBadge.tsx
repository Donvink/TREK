import type { TravelFactStatus } from '@trek/shared'

const STYLES: Record<TravelFactStatus, { label: string; className: string }> = {
  verified: { label: '已核验', className: 'bg-success-soft text-success' },
  reference: { label: '参考', className: 'bg-info-soft text-info' },
  unverified: { label: '未核验', className: 'bg-warning-soft text-warning' },
}

/** The three states every checked fact carries, in one place so the planner and the plan page read alike. */
export default function FactStatusBadge({ status }: { status: TravelFactStatus }) {
  const style = STYLES[status]
  return <span className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>{style.label}</span>
}
