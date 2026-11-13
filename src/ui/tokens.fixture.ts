import type { DomainStatus } from '../contracts';

export const DOMAIN_STATUS_VALUES: DomainStatus[] = [
  'no_change_detected', 'change_from_baseline', 'sustained_trend',
  'baseline_not_established', 'check_entry', 'not_measured',
];
