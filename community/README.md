# 关卡社区

桌面和网页共用作品目录。社区文件是可编辑设计的 gzip 包，包含版本、源游戏信息、关卡依赖和校验值。下载者在本机连接 Steam 版游戏后导入。

## 本地预览

```powershell
npm ci
npm ci --prefix community
npm run community:check
npm run community:start
```

打开 http://127.0.0.1:4176 。桌面端默认连接线上社区。本地开发时，在启动桌面端前设置 `$env:SINKING_STAR_COMMUNITY_URL='http://127.0.0.1:4176'` 指向测试服务。测试目录使用 SQLite，目录和压缩包保存在 `.community-local`。用 `SSTAR_COMMUNITY_DATA`、`SSTAR_COMMUNITY_PORT` 可建立独立测试实例。

从旧版本切换前先停止旧的本机社区。新版本首次启动时会把同一目录内的旧 PostgreSQL 测试目录复制到 SQLite，保留原数据库与文件。这个迁移只在本机执行。

从桌面端的「我的工程」或「关卡库」点对应作品的「发布」，也可以在「关卡社区」点「发布作品」选择内容。编辑器内的「导出与分享」适合发布当前编辑的关卡或工程。确认公开范围与图片后发布，下载也可以在桌面端直接完成。

登录后从桌面左栏打开「我的发布」，按工程或单关管理作品。名称、简介和标签可以直接修改，替换关卡或工程内容时发布新版本。工程发布时先上传封面。作者在桌面社区展开某个关卡组后，才补传这一组缺少的缩略图，折叠后停止排队。社区可按时间排序，也可以点击标签筛选。关联了其他关的作品请作为完整工程发布。

桌面端缓存公共目录、作品详情和已加载的缩略图，重启后也能复用。目录和详情在五分钟内切换时无需联网，缩略图通常在一天内复用。失败时可继续浏览已缓存的公共内容，顶部的「刷新社区」可立即检查更新。

桌面首页的「新建单关」直接打开空白关卡，保存为 `.sstar.json`，可在首页重新打开或导入世界工程。「新建工程」用于制作包含大地图和多关的作品。

在「我的工程」展开工程，点击「选关加入关卡库」，勾选所需小关后保存到「我的关卡」。使用工程已保存的版本，每个勾选关卡单独收录，必要的跨关依赖随该关保留。

桌面「关卡库」分为「我的关卡」和「已下载」。可见的关卡生成并缓存场景预览。 用立方体图标打开 3D 弹窗。左键旋转，中键平移，滚轮缩放。点击窗外或右上角关闭。「试玩」直接进入原游戏中的主关卡，「编辑单关」打开可另存的单关副本。带必要依赖的关卡组沿用「编辑副本」。任意工程的「导入关卡」均可从库中选择关卡与目标分组。网页保存的分享包也可直接导入。社区的「工程」展示完整作品，「关卡库」展示独立发布的单关及依赖关卡组。

桌面社区的单关列表可以直接下载和打开 3D。单关和工程都有临时试玩入口。试玩使用一次性独立存档，退出后清理进度。桌面「我的工程」逐关显示 3D 与试玩入口，工程行的同一组按钮用于大地图。

桌面社区详情和逐关列表提供 3D 预览图标。旧版社区接口也可预览能独立下载的关卡。有跨关依赖时可下载到关卡库预览，更新社区服务后也可以在详情中直接预览。点击后优先从已下载作品或本机预览缓存读取，只在缺少缓存时请求指定关卡。单关预览压缩后限 512 KiB，本机预览缓存限 50 MiB。旧的工程分享包若解压超过 4 MiB，下载到关卡库后可从本机预览。模型和材质由本机 Steam 安装提供。图片和下载仍共用社区每月 4 GiB 传输额度。

作品封面和手动图片保留最多 1920 × 1080 的 WebP，按原比例缩小。先在 80–85 的画质范围内压缩，超过 1 MiB 后自动降低分辨率。旧版社区接口接收兼容的小图。列表使用小图，点击放大才取高清图。大图支持拖动、滚轮缩放、适应窗口及下载。旧作品继续提供已有图片。

## 原版世界本机样本

在已连接 Steam 游戏的电脑上设置 `SINKING_STAR_GAME`，运行 `npx tsx community/native-sample-setup.ts`。脚本生成独立的本机工程和网页目录。桌面从「我的工程」打开样本，本机社区在作品列表显示同一份原版目录。

桌面与网页样本可用 `node community/native-sample-check.mjs` 验证。它生成代表性场景的缩略图和界面截图，图片由本机预览服务提供。

## Cloudflare

网页和社区接口使用 Workers，账号、作品目录和举报使用 D1，gzip 关卡包和 WebP 图片使用私有 R2 存储桶。桌面自动连接同一个站点。桌面首次登录只填写用户名，登录凭据保存在本机，换设备可以用作者账号中的恢复码。

### 本地验证部署

在仓库根目录用 Node.js 22.13 或更高版本运行以下命令。

```powershell
npm exec --prefix community -- wrangler d1 migrations apply CATALOG --local --config community/wrangler.jsonc
npm run community:dev
```

默认端口 8787。从另一个终端运行 `npm run community:worker-check`，使用隔离测试账号验证新建、搜索、下载、更新和下架。Wrangler 的本地数据库和文件与 `.community-local` 分开。

### 云端预览

登录 Cloudflare，授权 Wrangler 管理 Workers 和 D1。R2 首次启用时需要账号所有者完成其订阅流程。使用预览专用的 D1 数据库和 R2 存储桶。

```powershell
npm exec --prefix community -- wrangler login
npm exec --prefix community -- wrangler d1 create sinking-star-community-preview
npm exec --prefix community -- wrangler r2 bucket create sinking-star-community-preview
Copy-Item community/wrangler.jsonc community/wrangler.local.jsonc
```

在 `wrangler.local.jsonc` 中填写实际 `database_id`。资源名与上述命令一致时，保留默认存储桶名和数据库名。部署目录由构建命令生成。

```powershell
npm run community:build
npm exec --prefix community -- wrangler d1 migrations apply CATALOG --remote --config community/wrangler.local.jsonc
npm exec --prefix community -- wrangler deploy --config community/wrangler.local.jsonc
```

用部署返回的 HTTPS 地址访问网页，检查 `/api/works` 并运行 `npm run community:worker-check -- <社区地址>`。另用代表性的大工程检查上传与逐关导出耗时。Workers 的 CPU 限额随套餐变化。正式环境采用独立的数据库和存储桶。

运营人员可在 D1 的 `reports` 表查看举报，在 `works.active` 标记下架。按期备份 D1 和 R2，核对实际存储额度。

[Wrangler 部署](https://developers.cloudflare.com/workers/wrangler/commands/) · [D1 迁移](https://developers.cloudflare.com/d1/reference/migrations/) · [R2 启用步骤](https://developers.cloudflare.com/r2/get-started/) · [Workers 限额](https://developers.cloudflare.com/workers/platform/limits/)
