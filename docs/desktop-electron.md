# 桌面应用说明

这个桌面应用不会重写现有业务系统。它的作用是把当前本地私有化 Docker 部署包在一个电脑应用窗口里，负责启动服务、显示启动状态、打开系统页面，并提供托盘菜单。

## 日常启动

优先双击已经生成的便携版程序：

```text
desktop\release\企业行政资料管理系统 便携版 0.1.0.exe
```

首次启动前需要确保电脑已安装 Docker Desktop。应用会自动检查 Docker 是否可用，如果 Docker Desktop 未启动，会尝试拉起 Docker Desktop，然后等待系统服务就绪。

如果需要更像普通软件一样安装到电脑里，可以使用安装程序：

```text
desktop\release\企业行政资料管理系统 安装程序 0.1.0.exe
```

安装版会创建桌面快捷方式和开始菜单快捷方式，但仍然依赖本机 Docker Desktop 和当前项目目录里的部署文件。
打包前需根据 `desktop\assets\project-root.txt.example` 创建本机专用的 `desktop\assets\project-root.txt`，用于让安装后的应用找到 Docker Compose 和本地存储目录。该本机路径文件不会提交到 Git。

## 开发调试启动

如果后续还要继续修改代码，可以双击：

```text
start-admin-docs-desktop（桌面应用）.bat
```

也可以在项目根目录运行：

```powershell
pnpm --filter desktop dev
```

## 当前行为

- 检查并等待 Docker Desktop 可用。
- 执行 `docker compose --env-file .env.production -f docker-compose.prod.yml up -d`。
- 等待 `http://localhost:8080/api/health` 返回正常。
- 自动打开 `http://localhost:8080`。
- 关闭窗口时隐藏到系统托盘。
- 托盘菜单支持打开系统、重启系统、停止系统、打开文件存储目录、打开项目目录、退出桌面应用。

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
