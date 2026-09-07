# 轻盯 Market Float

一个适合上班时低调查看 **A 股和港股行情、主力资金**，并可一键伪装成待办便签的 Windows 悬浮窗。

![轻盯界面预览](docs/preview.png)

## 它能做什么

- 每 3 秒批量刷新自选股价格、涨跌幅和主力资金
- 展示今日分时、近 20 日主力资金、超大单与大单净额
- 使用 `Ctrl + Alt + M` 一键切换成工作待办便签
- 支持窗口置顶、透明度、位置锁定、系统托盘
- 支持目标价和涨跌幅提醒
- 支持 A 股与港股，免 API Key
- 所有自选、提醒和待办只保存在本机

## 下载与使用

在 GitHub Actions 的最新成功构建中下载 Windows 便携版，解压后直接运行，无需安装。

> 未购买商业代码签名证书，Windows 首次运行可能出现 SmartScreen 提示。

## 本地开发

需要 Node.js 22 或更高版本。

```powershell
npm install
npm run dev
```

测试与构建：

```powershell
npm run typecheck
npm test
npm run dist
```

## 技术栈

Electron · React · TypeScript · Vite · electron-builder

## 数据与风险说明

行情来自无需密钥的公开接口。3 秒是客户端请求频率，不代表数据源每 3 秒更新。“主力净流入”沿用数据源的大单与超大单净额口径，无法据此确认交易者身份。

本项目仅供信息展示和学习交流，不构成投资建议，也不可作为交易或下单依据。公开接口可能延迟、限流、变更或停止服务。

## License

[MIT](LICENSE)
