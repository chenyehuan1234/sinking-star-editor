# 数据与接口

## 包与实体

`GamePackage` 验证 `simp` v1 的头、`toc!` 目录、重复路径、条目边界与重叠，保留原条目顺序与数据。没有修改时直接复制原包；有修改时重算偏移与大小，再解析检查输出。

`parseEntities` / `writeEntities` 处理 `enty` v7、header value 25、动态类型表和长度明确的实体记录。ID 与类型索引按当前文件校验。r67271 实测有 88 种类型，不能套用 Demo 的固定类型索引。

基础成员从头顺序解析，只跳过已确认长度的数据。**0xFD 也会出现在属性值内部，不能将它当成分隔符做全局 split。** 遇到未知成员形状立即停止，将需要完整基础字段的变换操作设为只读。

坐标成员 `0/1/2` 与 `0x21/22/23` 同时修改，保留每个字段的默认值前缀；缺省为零的字段在需要时按顺序补入。朝向为 `6/7/8/9` 四元数，界面仅提供绕 Z 轴旋转。其余字段按原始字节保留。

v0.2 静态解析 exe 中 Jai 类型反射，按 Undoable_Entity_Data 与各实体结构的成员顺序生成属性编号，过滤常量和别名。属性保存默认值和现值两段；基础材料字段 0x20 是字符串数组。未知动态数组停止解析并保留尾部。

更正 v0.1 研究：Settings 0x1060 实为 sound_level_name，不能当作关卡身份。新编译器保留声音名称；关卡身份由 entities 文件名、Level_Entry.level_name 和 level_set 决定。

## 工程与补丁

公开工程类型定义见 `src/shared.ts`。`.sstar.json` 只包含：

```json
{
  "format": "sinking-star-project",
  "version": 1,
  "sourceHash": "<原始 levels.package 的 SHA-256>",
  "sourceBuild": "26006400",
  "template": "mirror_1",
  "name": "my_level",
  "operations": [
    { "kind": "transform", "id": 1048662, "position": [10, 13, 0] },
    { "kind": "clone", "id": 1048662, "newId": 1048577, "position": [11, 13, 0] },
    { "kind": "delete", "id": 1048577 }
  ]
}
```

操作按顺序应用，引用当时存在的实体；复制 ID 必须唯一且留在原实体命名空间内。位置要求有限数值、绝对值不大于 100000。名称只允许 ASCII 字母、数字、下划线与短横线，不能覆盖其他官方关卡名。工程版本、Build 或哈希不匹配拒绝执行。

## 桌面边界

渲染器无 Node 权限，启用 sandbox 与 contextIsolation，只通过预加载 `EditorApi` 访问有限 IPC；主进程校验发送方。禁止新窗口、外部导航、远程连接和权限请求。

文件操作串行执行；构建输出先写临时文件再原子替换。测试副本受 `playtest-state.json` 管理，记录源包、部署包、待完成包哈希和辅助资源路径。哈希无法解释时停止写入，不把未知包当成可恢复状态。部署不触碰 Steam 安装。

试玩使用复制的完整游戏与合法本机 Steam 会话，副本的 `steam_appid.txt` 避免 Steam 重定向到原安装。旧版单关用 `intro` 测试槽；世界工程同时生成 `overworld` / `intro` 自定义地图和所有独立小关卡；不修改 exe，不注入内存，不依赖开发控制台。


## 世界工程与原生机关

`.sstar-world.json` 记录地图尺寸、0/1/2 地形格、出生点、入口、小关卡工程列表。Wall_Set 的 corner 是相对实体位置的坐标；地板体素置于 Z=-1，墙体置于 Z=0，以独立方格平面生成可见表面。入口清空三个 unlocked_by_id，且每关独立 level_set，避免顺序锁定。

PID 在关卡内作用域有效，同一模板的多个独立关卡保留各自原 PID，以兼容原始绘色、光照和反射探针。只给新物件使用独立命名空间。跨模板预设清空原有 PID 关联，合并资源清单；部署时按新关卡名前缀别名辅助资源。Switch/Gate 使用 flavor 频道，Teleporter 使用 target_id；Gem/Gem_Slot 使用引擎原生房间规则。

## 专用战役

仅管理带 _editor-owner.json 的 Editor_<worldid> 目录。v33 Status.sokoban_status 保留固定前缀、进度与未知尾部，仅改当前关卡与时间；新战役直接进入 overworld。游戏按最近战役选择，启动前先持久化恢复意图，再提升专用战役时间。退出后降低专用战役时间和 mtime，保留正常战役逐字节不变。连接时恢复中断的会话。每轮归档本工程 intro/overworld.history，使快速选关出生点生效；保留未修改小关卡的历史。


## v0.3 三维与全对象扩展

工程 version 1 保持兼容，transform 新增可选 rotation（xyzw 单位四元数）和 scale（xyz，允许镜像负值但不允许零）；properties 的 NativeValue 支持字符串、64 位整数十进制文本和资源列表。properties.sourceTemplate 用于合并跨模板外观所需清单。prefab.assembly 遍历同关已识别 PID 与 PID 数组，保留相对位置并重映射新 ID；group_id、riding_on_id 脱离原场景，不会复制任意剧情系统。

map.objects 为可选原生对象操作列表；大地图 hub/intro 和预览应用同一序列。900 命名空间用于新增可编辑对象，899 用于新建体素。terrain 操作按整数坐标编辑 Wall_Set 位图，新建体素附带 5 个原生平面；擦除旧碰撞不切割原来的美术网格。Ocean_Map.ocean_values 为 u8 数组，整体移动同步其 grid.corner。

资产头使用 Asset_Header（u16 type/version/flags/header_size，u32 uncompressed_size）；compressed_mesh 为 v16，纹理为 v8。压缩载荷使用原始 LZ4。静态顶点位置 12 字节，蒙皮位置流 20 字节；另有 20 字节属性流、4 字节颜色流。LOD 材质组为 12 字节，索引 count 以 16 位字计数，索引本身可为 u16/u32。原始骨骼动画尾部不改写。

普通纹理支持 BC1/3/4/5、RG8、BGRA8、RGBA16F 等本机实际格式；mip 行 256 字节、层 512 字节对齐。Worker 解码、源包/exe 哈希与资源 mtime/size 组成缓存身份。模型/贴图读取只接受源目录中预先枚举的名称。原生材质继承、diffuse 和基础 tint/world UV 在编辑器预览，专用着色器与动态行为由原游戏执行。


## v0.3.1 组合与存在组修正

实机复刻 heroes1_1 证实 group_id 同时承载玩法存在组关联。新复制的同关对象保留 group_id；跨模板独立 prefab 仍默认清除源 PID，但可通过受校验的 group_id 属性关联当前关卡 Group。复刻对照在保留原生 Group 上下文的同时恢复该引用。编辑器检查失效组与组循环。不可再将 group_id 视为可忽略的编辑元数据。


## v0.7.7 原生循环与角色控制（兼容 v3 工程）

`EditorProject.topology` 可选，包含 `corner: [x,y,z]`、`size: [x,y,z]`、`wrapping`、`wrappingOverride`、`forceWrappingOverride`。缺省不写回 Settings；空白关继续按内容计算边界。自定义时以整数格中心写入 `grid.corner.*`、`grid.squares_x/y`、`grid.num_squares`、`squares_z`、`grid.wrapping`，并启用 `lock_grid`，不再自动扩边。X/Y 循环，Z 不循环。方向覆盖与强制标志是原生重复画面参数，不作为分轴物理开关；所有 Wrapping_Mask 原样保留。

新增 `control` 操作：`{kind:"control", id, ids, targetId?}`。ids 仅为本关 Guy；有 targetId 时加入目标的原生控制身份，无目标时所选角色各自独立。`turn_order_id` 为 0 时原游戏使用角色自身 PID；显式数值按直接相等分组，不递归跟随引用，也不按 mesh、skill_flags 或 group_id 合组。原锚点删除后控制身份可继续有效，不当作失效引用。

控制设置保留位置、外观能力、存在组与切换顺序。原锚点主动离组时，其余成员改用新身份，并同步更新 Rock 中序列化的 `transmute_stashed_turn_order_id`。独立复制和区域粘贴重映射控制身份；只复制部分成员或原锚点已删除时，仍保留副本内部的同步，避免错误关联原组。共享关联保留未复制的外部控制身份。
