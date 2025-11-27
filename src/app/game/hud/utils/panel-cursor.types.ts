export type PanelCursorMode = 'grimoire' | 'inventory' | 'map';

export interface PanelCursorOverlayState {
  mode: PanelCursorMode;
  viewportX: number;
  viewportY: number;
  /** Base radius in pixels to scale the cursor visuals */
  radius: number;
}
