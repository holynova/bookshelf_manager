# 书香管家 - AI 拍照书架整理应用

一款利用 AI 智能拍照整理物理藏书、自动建档并还原虚拟原木书架的单页面应用。

## 📸 项目截图
![书香管家主面板](screenshot.png)

## 🌐 项目链接
- **代码仓库 (GitHub)**: [github.com/holynova/bookshelf_manager](https://github.com/holynova/bookshelf_manager)
- **在线体验 (GitHub Pages)**: [holynova.github.io/bookshelf_manager/](https://holynova.github.io/bookshelf_manager/)

## 🚀 核心功能
- **拍照自动识别**：通过设置中的兼容 Chat Completions 的多模态接口分析书架照片，生成书籍信息和摆放数据；模型返回的书名、作者和评分需要核对。
- **三维虚拟书架**：逼真还原书籍摆放位置与外观。支持点击查看详情及豆瓣、微信读书、淘宝跳转。
- **本地持久化**：书架记录使用 IndexedDB 存储；Demo 模式使用示例数据，无需 API Key。实际识别会把图片发送到配置的模型服务。

## 先试用，再识别

打开在线体验，先使用 Demo 模式查看示例书架。识别自己的照片时，在设置中填写接口地址、API Key 和支持图像输入的模型名称，再关闭 Demo 模式。配置保存在当前浏览器，识别请求见 [src/llm.ts](src/llm.ts)。

## 本地运行

```bash
npm ci
npm run dev
```

打开终端打印的地址。`npm run lint` 检查代码；`npm run build` 进行类型检查并构建；`npm run preview` 预览构建产物。
