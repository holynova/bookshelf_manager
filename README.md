# 书香管家 - AI 拍照书架整理应用

一款利用 AI 智能拍照整理物理藏书、自动建档并还原虚拟原木书架的单页面应用。

## 📸 项目截图
![书香管家主面板](screenshot.png)

## 🌐 项目链接
- **代码仓库 (GitHub)**: [github.com/holynova/bookshelf_manager](https://github.com/holynova/bookshelf_manager)
- **在线体验 (GitHub Pages)**: [holynova.github.io/bookshelf_manager/](https://holynova.github.io/bookshelf_manager/)

## 🚀 核心功能
- **拍照自动识别**：基于 Google Gemini API 多模态大模型分析书架照片，一键提取书名、著者、简介和豆瓣评分，确定书籍的物理排布与色调。
- **三维虚拟书架**：逼真还原书籍摆放位置与外观。支持点击查看详情及豆瓣、微信读书、淘宝跳转。
- **本地持久化**：使用 IndexedDB 存储，数据 100% 留存在浏览器。支持 Demo 演示免 key 体验。
