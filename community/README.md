# 关卡社区

桌面和网页共用作品目录。社区文件是可编辑设计的 gzip 包，包含版本、源游戏信息、关卡依赖和校验值。下载者在本机连接 Steam 版游戏后导入。

## 本地预览

```powershell
npm ci
npm ci --prefix community
npm run community:check
npm run community:start
```

打开 http://127.0.0.1:4176 。桌面端在「关卡社区 → 社区地址」填写同一个地址。测试账号与作品保存在 `.community-local`。用 `SSTAR_COMMUNITY_DATA`、`SSTAR_COMMUNITY_PORT` 可建立独立测试实例。

工程内用「导出与分享」选择当前关或整个工程。确认公开范围与图片后发布，也可以先保存 `.sstar-share.gz`，再从网页上传。

桌面首页的「新建单关」直接打开空白关卡，保存为 `.sstar.json`，可在首页重新打开或导入世界工程。「新建工程」用于制作包含大地图和多关的作品。

在「我的工程」展开工程，点击「选关加入关卡库」，勾选所需小关后保存到「我的关卡」。使用工程已保存的版本，每个勾选关卡单独收录，必要的跨关依赖随该关保留。

桌面「关卡库」分为「我的关卡」和「已下载」。可见的关卡生成并缓存场景预览。「试玩」直接进入原游戏中的主关卡，「编辑单关」打开可另存的单关副本。带必要依赖的关卡组沿用「编辑副本」。任意工程的「导入关卡」均可从库中选择关卡与目标分组。网页保存的分享包也可直接导入。社区的「工程」展示完整作品，「关卡库」展示独立发布的单关及依赖关卡组。

## 原版世界本机样本

在已连接 Steam 游戏的电脑上设置 `SINKING_STAR_GAME`，运行 `npx tsx community/native-sample-setup.ts`。脚本生成独立的本机工程和网页目录。桌面从「我的工程」打开样本，本机社区在作品列表显示同一份原版目录。

桌面与网页样本可用 `node community/native-sample-check.mjs` 验证。它生成代表性场景的缩略图和界面截图，图片由本机预览服务提供。

## 腾讯云国际站预览

1. 登录腾讯云国际站，选择免费工作区和境外加速区域。
2. 为预览配置可从国际站 Cloud Functions 访问的 PostgreSQL。把连接地址作为 `DATABASE_URL` 设置在 Makers 的预览环境变量里，启用数据库服务提供的 TLS。预览和正式环境使用各自的数据库与项目。
3. 创建 Direct Upload 类型的 Makers 项目。使用国际站会话部署。

```powershell
npx edgeone login --site global
npx edgeone whoami
npm run community:build
npx edgeone makers deploy ./dist/community --site global --area overseas --env preview --name sinking-star-community-preview
```

4. 在国际站控制台打开预览链接。确认 `/api/works` 返回目录，再用测试作品走通注册、上架、逐关下载、完整下载、导入、更新和下架。用接近 5 MiB 的分享包验证上传和下载。
5. 有域名后再绑定。公开前从无代理的大陆电信、移动、联通及两个海外地区测首屏、搜索、登录、上传和下载，记录成功率与耗时。

Blob 保存 gzip 包和 WebP 预览图。应用接近存储额度时暂停新发布，下载按月计量。运营人员可在 PostgreSQL 的 `reports` 表查阅举报，并通过 `works.active` 下架作品。按期备份数据库和 Blob，升级套餐前核对控制台实际额度。

[国际站部署命令](https://pages.edgeone.ai/document/edgeone-cli) · [预览域名规则](https://pages.edgeone.ai/document/domain-overview) · [免费额度](https://pages.edgeone.ai/document/billing-plan-comparison)
