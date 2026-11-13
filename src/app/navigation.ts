/**
 * Active-route matching for the main navigation.
 *
 * React Router's prefix matching made `/hazards` light up on
 * `/hazards/radiation` (the Radiation monitor). Each destination now matches
 * through this one function, so exactly one leaf item is selected.
 */
export const RADIATION_MONITOR_PATH = '/hazards/radiation';
export const HAZARDS_PATH = '/hazards';

export function isNavItemActive(to: string, pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (to === '/') return path === '/';
  if (to === RADIATION_MONITOR_PATH) return path === RADIATION_MONITOR_PATH;
  if (to === HAZARDS_PATH) {
    // The hazard detail pages (distance, isolation) belong to Hazards; the radiation monitor does not.
    return path === HAZARDS_PATH
      || (path.startsWith(`${HAZARDS_PATH}/`) && path !== RADIATION_MONITOR_PATH && !path.startsWith(`${RADIATION_MONITOR_PATH}/`));
  }
  return path === to || path.startsWith(`${to}/`);
}
