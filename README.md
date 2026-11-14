# TourBox ColorLab

适用于 Windows 上的 TourBox 灵动拾色器。包含 HSL 色轮绘制优化，以及保持常驻面板位置的开关。

## 安装

1. 确认使用默认安装目录下的 Windows 版 TourBox Console。当前支持 **5.12.1 正式版**与 **5.12.0 Beta10.1** 的已验证构建。
2. [下载发布包](../../releases/latest)，将 ZIP 完整解压到一个文件夹。
3. 从 Windows 系统托盘退出 TourBox Console。双击 `Install.cmd`，确认管理员提示，然后重新打开 TourBox Console。
4. 在 Photoshop 打开常驻灵动拾色器。面板上方的「常驻锁定」默认开启。按取色键时，锁定会拦截临时取消常驻的请求。关闭开关可恢复 TourBox 原有的取色键行为。

安装器使用 TourBox 自带的运行环境，在本机验证原包并生成补丁。无需额外安装 Node.js。同一个版本号可能对应不同构建，安装器会校验文件内容，发现不兼容就停止。

## 每次更新 TourBox 后如何重新应用

1. 先在 TourBox Console 导出需要保留的预设。若当前装了 ColorLab，退出托盘后运行旧版包的 `Restore.cmd`，恢复同版本备份。[官方预设导出说明](https://www.tourboxtech.com/en/news/import-and-export-presets-in-tourbox.html)
2. 从官网下载 Windows ZIP，完整解压，再运行其中的官方 EXE。按安装向导要求卸载旧版，再安装新版。[TourBox 官方 Windows 下载](https://www.tourboxtech.com/uk/downloads/windows/)
3. 先打开官方新版，确认设备、预设和拾色器能正常使用。预设缺失时从此前导出的文件导入，然后从系统托盘退出 TourBox Console。
4. 到 [ColorLab 发布页](../../releases/latest) 查看是否明确支持你刚安装的 TourBox 版本。下载对应 ZIP，完整解压，再双击 `Install.cmd`。如果还没有适配，就先使用官方新版。不要把旧版 `app.asar` 或回退备份复制到新版目录。
5. 重开 Console，在 Photoshop 测试 HSL 色轮，并在常驻锁定开启时按一次取色键。确认面板留在原位，且取色结果正常更新。

官方 EXE 卸载重装会换掉当前拾色器文件，所以版本更新后需要重新应用对应补丁。安装目录里即使还留有旧备份，回退也只使用与当前补丁匹配的版本。

## 回退

从系统托盘退出 TourBox Console，双击 `Restore.cmd`，确认管理员提示，然后重新打开 TourBox Console。它会恢复应用补丁前保留的版本。若安装前已有性能优化，回退后会保留该优化。

## 验证

- 5.12.0 Beta10.1 的一次本机安装前后对照中，大号 HSL 外圈颜色更新消息间隔中位数由 55 ms 降至 17 ms。
- 5.12.1 的 HSL 色盘在三种尺寸、每种 76 个色相下与原版逐像素一致。常驻锁定覆盖临时取色请求、关闭锁定、非驻留请求和结束取色。
- 构建脚本会测试绘制路径、检查脚本语法、验证 1762 个未修改的存档条目，并校验最终文件。
- 常驻锁定只改变取色请求触发的面板行为。屏幕取样仍由 TourBox 管理。

这是独立维护的非官方补丁，与 TourBox Tech 无关联。发布包由构建工具、实现代码和安装脚本组成。TourBox 的软件使用受其许可条款约束。[TourBox 许可条款](https://www.tourboxtech.com/en/privacy-policy-app/)
