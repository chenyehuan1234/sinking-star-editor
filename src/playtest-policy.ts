/** Legacy shared-save entry points remain disabled.
 * Current launch commands require an explicit profile and a verified save-root patch. */
export const PLAYTEST_SUSPENSION = '旧版共享存档入口已停用。请使用顶栏试玩，明确选择或新建独立测试存档。';

export function blockPlaytest(): never {
  throw Object.assign(new Error(PLAYTEST_SUSPENSION), {code: 'PLAYTEST_SUSPENDED'});
}

export function assertPlaytestCommand(method: string): void {
  if (['launch','worldLaunch','worldReset'].includes(method)) blockPlaytest();
}
