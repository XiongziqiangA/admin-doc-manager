# 桌面应用说明

这个桌面应用不会重写现有业务系统。它支持两种连接方式：本机模式负责启动当前电脑上的 Docker 部署包；服务器模式连接已经部署好的企业管理系统，负责显示启动状态、打开系统页面，并提供托盘菜单。

## 日常启动

优先双击已经生成的便携版程序：

```text
desktop\release\企业行政资料管理系统 便携版 0.1.0.exe
```

本机模式首次启动前需要确保电脑已安装 Docker Desktop。应用会自动检查 Docker 是否可用，如果 Docker Desktop 未启动，会尝试拉起 Docker Desktop，然后等待系统服务就绪。服务器模式不需要本机安装 Docker。

如果需要更像普通软件一样安装到电脑里，可以使用安装程序：

```text
desktop\release\企业行政资料管理系统 安装程序 0.1.0.exe
```

安装版会创建桌面快捷方式和开始菜单快捷方式。本机模式仍依赖本机 Docker Desktop 和当前项目目录里的部署文件；服务器模式只依赖可访问的 HTTPS 服务器。
打包前需根据 `desktop\assets\project-root.txt.example` 创建本机专用的 `desktop\assets\project-root.txt`，用于让安装后的应用找到 Docker Compose 和本地存储目录。该本机路径文件不会提交到 Git。

## 开发调试启动

如果后续还要继续修改代码，可以双击：

```text
start-admin-docs-desktop（桌面应用）.bat
```

该脚本会优先启动 `desktop\\release` 中已经生成的便携版程序；如果便携版不存在，则自动回退到 Electron 开发模式。

也可以在项目根目录运行：

```powershell
pnpm --filter desktop dev
```

## 本机模式行为

- 检查并等待 Docker Desktop 可用。
- 执行 `docker compose --env-file .env.production -f docker-compose.prod.yml up -d`。
- 等待 `http://localhost:8080/api/health` 返回正常。
- 自动打开 `http://localhost:8080`。
- 桌面状态页提供“启动 Docker 服务”“重启 Docker 服务”“停止 Docker 服务”快捷按钮。
- 关闭窗口时隐藏到系统托盘。
- 托盘菜单支持打开系统、启动/重启/停止本项目 Docker 服务、打开文件存储目录、打开项目目录、退出桌面应用。
- “停止 Docker 服务”只执行当前项目的 Compose `down`，不会关闭 Docker Desktop，也不会影响其他项目的容器。

## 服务器模式行为

在托盘菜单或启动状态页打开“连接设置”，选择“服务器模式”，填写完整的 HTTPS 地址，例如：

```text
https://admin.example.com
```

保存后，桌面端会等待服务器健康检查通过并打开远程系统。文件选择、上传、打开、下载和打印请求都通过该服务器处理。本机不会启动或停止 Docker，服务器模式下“打开文件存储目录”和“打开项目目录”菜单会自动禁用。

服务器地址只允许 `http://localhost`、`http://127.0.0.1` 或 HTTPS；不允许账号密码、查询参数、片段或子路径。不要把数据库密码、JWT 密钥或 API Key 写入桌面端配置。

## 重新打包

代码修改后如需重新生成便携版程序：

```powershell
pnpm --filter desktop dist
```

重新生成安装程序：

```powershell
pnpm --filter desktop dist:installer
```

注意：当前版本仍依赖这个项目目录里的 `docker-compose.prod.yml`、`.env.production` 和本地存储目录。便携版 `.exe` 可以放在当前项目目录内使用；如果移动到其他位置，需要先设置 `ADMIN_DOCS_ROOT` 指向项目根目录。
