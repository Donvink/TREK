# 部署到 VPS（攻略行程原型）

在一台小型 VPS 上运行本分支的 TREK、图片识别（OCR）服务和自动 HTTPS。适合阶段 ③ 的 5–8 位真实用户测试。

> 本机没有 Docker，这套配置只做过语法检查，没有实际构建过。第一次在服务器上构建后，请按下面「验证」一节逐项确认。

## 需要准备

- 一台 VPS：2 核、**至少 2 GB 内存**（OCR 约占 1 GB），Ubuntu 24.04，已用官方 apt 源装好 Docker 和 Compose 插件（不要用 snap 版）。
- 一个域名，A 记录指向这台 VPS 的 IP。
- 预算：VPS 加域名，阶段 ③ 两个月约 CHF 15–25，在计划的 CHF 25 以内。

## 步骤

```bash
# 1. 取代码（你的 fork 和分支）
git clone -b feat/travel-prototype https://github.com/Donvink/TREK.git
cd TREK/deploy

# 2. 填配置
cp .env.example .env
openssl rand -hex 32          # 结果填进 .env 的 ENCRYPTION_KEY
nano .env                     # 填域名、管理员邮箱和强密码

# 3. 构建并启动（第一次构建 TREK 需要十几分钟）
docker compose up -d --build
docker compose ps             # 三个服务都应为 running / healthy
```

只开放 80 和 443 端口，其余用防火墙关掉：

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```

## 启动后在网页里做

1. 打开 `https://你的域名`，用 `.env` 里的管理员账号登录，立刻改密码。
2. Admin → Addons：打开 **AI Parsing**，选 OpenAI 兼容接口，Base URL 填 `https://generativelanguage.googleapis.com/v1beta/openai`，模型 `gemini-3.1-flash-lite`，填 Gemini API key。在 Google AI Studio 的结算页同时设好消费上限。
3. Admin → Users：关闭开放注册，给测试用户发邀请链接。
4. Admin → Backups：打开每日自动备份。

## 验证

- `https://你的域名` 证书有效，浏览器无警告。
- 攻略素材 → 手动添加攻略，上传一张带店名的截图，提示「其中 1 张识别出文字」。这说明 OCR 服务通了。
- 提取地点能出结果。这说明大模型配置正确。
- 两个浏览器同时打开同一个行程，一边改动，另一边立刻更新。这说明 WebSocket 经过 Caddy 正常工作。
- 手机浏览器能「添加到主屏幕」。

## 日常维护

```bash
docker compose logs -f app                 # 看日志
git pull && docker compose up -d --build   # 更新到分支最新版本
```

**备份**：`deploy/data/` 是数据库和密钥，`deploy/uploads/` 是上传的文件。除了 TREK 自带的备份，定期把这两个目录拷到本机。`ENCRYPTION_KEY` 另外单独保存。

## 不在服务器上运行的东西

小红书自动采集器（`scripts/travel-sources/collect_rednote.py`）依赖你本人的登录会话，只在你自己的电脑上用，不要放到服务器上。服务器上的用户通过「手动添加攻略」导入。
