# TourBox ColorLab

适用于 Windows 上的 TourBox 灵动拾色器。包含 HSL 色轮绘制优化，以及保持常驻面板位置的开关。

## 安装

1. 确认 TourBox Console 显示 **5.12.0 Beta10.1**，且安装在默认的 `Program Files` 目录。
2. [下载发布包](../../releases/latest)，将 ZIP 完整解压到一个文件夹。
3. 从 Windows 系统托盘退出 TourBox Console。双击 `Install.cmd`，确认管理员提示，然后重新打开 TourBox Console。
4. 在 Photoshop 打开常驻灵动拾色器。面板上方的「常驻锁定」默认开启。按取色键时，锁定会拦截临时取消常驻的请求。关闭开关可恢复 TourBox 原有的取色键行为。

安装器使用 TourBox 本身附带的运行环境，在本机验证原包并生成补丁。无需额外安装 Node.js。它按文件校验值识别兼容性。**5.12.1 正式版及其他版本未经适配。**

## 回退

从系统托盘退出 TourBox Console，双击 `Restore.cmd`，确认管理员提示，然后重新打开 TourBox Console。它会恢复应用补丁前保留的版本。若安装前已有性能优化，回退后会保留该优化。

## 验证

- 大号 HSL 轮的一次本机安装前后对照中，外圈颜色更新消息间隔中位数由 55 ms 降至 17 ms。该指标记录颜色消息间隔。
- 构建脚本会测试绘制路径、检查脚本语法、验证 1762 个未修改的存档条目，并校验最终文件。
- 常驻锁定只改变取色请求触发的面板行为。屏幕取样仍由 TourBox 管理。

这是独立维护的非官方补丁，与 TourBox Tech 无关联。发布包由构建工具、实现代码和安装脚本组成。TourBox 的软件使用受其许可条款约束。[TourBox 许可条款](https://www.tourboxtech.com/en/privacy-policy-app/)
