# xu 的个人主页

静态个人主页，部署于 https://xmjlmm.github.io/ 。公开内容包含履历、项目、QQ 和 GitHub 联系方式，以及 posts.json 内的随笔。

## 写随笔

在主页点击“写博客”，右侧会展开写作区。草稿存于当前浏览器，可以导出和导入 JSON 备份。清除浏览器数据会清除本机草稿。换电脑前请导出备份。

发布时展开“连接 GitHub 以发布”，使用 xmjlmm 账号创建的 fine-grained personal access token，仅选择本仓库，授予 Contents 的 Read and write 权限。令牌只保留在页面内存中，刷新页面后需要重新输入。不要将令牌提交到仓库。

点击“发布到主页”会更新 main 分支的 posts.json，随后 GitHub Pages 自动部署。当前页面立即显示提交的文章，公开网址的更新可能需要几分钟。“从主页撤回”会从当前网站数据中移除文章，并保留本机草稿。公开仓库的提交历史仍保留先前发布的内容。

## 部署

仓库 Settings → Pages → Deploy from a branch，选择 main 分支、/(root) 目录。根目录 .nojekyll 保证文件直接作为静态内容发布。网站无构建依赖，资源均采用相对路径。

## 本机预览

在本目录运行 `python -m http.server 5174 --bind 127.0.0.1`，打开 http://127.0.0.1:5174/ 。

## 文件

- index.html 为个人履历和布局。
- style.css 为响应式样式。
- app.js 为文章阅读、浏览器草稿和 GitHub 发布功能。
- posts.json 只包含已发布文章。

GitHub Pages 的连通性取决于访客网络。发布后应使用实际访问者的网络验证。
