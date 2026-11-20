/** The workbench launches through the scoped run commands. */
export const PLAYTEST_SUSPENSION = '请使用工作台顶栏试玩，启动当前选中的范围。';

export function blockPlaytest(): never {
  throw Object.assign(new Error(PLAYTEST_SUSPENSION), {code: 'PLAYTEST_SUSPENDED'});
}

export function assertPlaytestCommand(method: string): void {
  if (['launch','worldLaunch','worldReset'].includes(method)) blockPlaytest();
}
