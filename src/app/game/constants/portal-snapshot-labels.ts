export const PORTAL_SNAPSHOT_LABELS = {
  HUMAN_DEFAULT: 'human-default-system',
  RESPAWN_ANCHOR_LATEST: 'respawn-anchor-latest'
} as const;

export type PortalSnapshotLabel = typeof PORTAL_SNAPSHOT_LABELS[keyof typeof PORTAL_SNAPSHOT_LABELS];

export function isPortalSnapshotLabel(label: string | null | undefined): label is PortalSnapshotLabel {
  if (!label) {
    return false;
  }
  return Object.values(PORTAL_SNAPSHOT_LABELS).includes(label as PortalSnapshotLabel);
}
