export const desktopLayoutBreakpoint = 1024;

export function isDesktopLayout(width: number): boolean {
  return width > desktopLayoutBreakpoint;
}
