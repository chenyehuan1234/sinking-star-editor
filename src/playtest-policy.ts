/** Fail closed until the game has a verified, separate save location.
 * Selecting an Editor_* campaign does not isolate the game's load menu. */
export const PLAYTEST_SUSPENSION = '试玩已暂停：游戏副本仍共用正式存档目录，载入原战役可能覆盖大地图进度。完成存档隔离验证前，禁止启动试玩；编辑、保存和导出仍可使用。';

export function blockPlaytest(): never {
  throw Object.assign(new Error(PLAYTEST_SUSPENSION), {code: 'PLAYTEST_SUSPENDED'});
}

export function assertPlaytestCommand(method: string): void {
  if (['launch','worldLaunch','runLaunch','prepare','deploy','worldDeploy','worldReset'].includes(method)) blockPlaytest();
}
