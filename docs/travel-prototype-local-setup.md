# 本地采集与旅行素材库

> 第一批实现：只读自动采集适配器、版本化 JSON、账户隔离的导入与来源查看。推荐、三方案、天气重排与图文导出仍在后续阶段。

## 启动 TREK

在仓库根目录执行 `npm ci`，再执行 `npm run dev`。依赖需要 Node.js 22+；第一次运行按 TREK 的启动日志完成本地账户设置。页面 `/travel-sources` 要求登录，可从桌面顶部“旅行素材”进入；手机可直接访问该地址。

运行说明与详细配置见 [开发环境](../wiki/Development-environment.md)。不覆盖已有数据库或账户。

本轮验证预览使用单独的 `.local/travel-sources/prototype.sqlite`。测试账号凭证保存在本地 `.local/travel-sources/local-account.json`；七条素材标题明确写明“集成测试素材（非真实攻略）”。验证记录见 [首批接入](travel-prototype-evidence/first-integration.md)。

## 准备采集

使用你自己的 `rednote_mcp.py` 本地副本。适配器只加载 `process_url`、`search_notes`、`get_note_content` 三个函数，移除 MCP 装饰器；不执行原文件顶层代码，不加载发帖或评论功能。该文件仍须来自你信任的代码，这不是执行不可信 Python 的沙箱。

```bash
uv venv .local/travel-sources/venv
uv pip install --python .local/travel-sources/venv/bin/python -r scripts/travel-sources/requirements.txt
.local/travel-sources/venv/bin/python -m playwright install chromium
```

首次登录和小样本采集：

```bash
.local/travel-sources/venv/bin/python scripts/travel-sources/collect_rednote.py \
  --source /absolute/path/to/rednote_mcp.py \
  --query '都灵 自然风光 美食 攻略' \
  --limit 5 \
  --images \
  --login \
  --output .local/travel-sources/turin.json
```

`--login` 打开可见浏览器，请本人完成登录，再回终端按 Enter。登录会话存在 `.local/travel-sources/browser`，不要上传、提交或分享。后续采集省略 `--login` 即以无界面模式复用该会话；需要自己的桌面显示环境才能首次登录。若已有 Chromium，可用 `--browser /path/to/chromium` 指定，实际兼容性需要测试。[Playwright 浏览器与持久上下文说明](https://playwright.dev/python/docs/api/class-browsertype#browser-type-launch-persistent-context)

若采集器启动的窗口加载异常，可以先用独立的系统 Chrome 登录，再让采集器连接这个本机窗口：

```bash
google-chrome --user-data-dir=/tmp/trek-rednote-login \
  --remote-debugging-address=127.0.0.1 --remote-debugging-port=9223 \
  https://www.xiaohongshu.com
```

在该窗口完成登录后运行：

```bash
.local/travel-sources/venv/bin/python scripts/travel-sources/collect_rednote.py \
  --source .local/travel-sources/upstream/rednote_mcp.py \
  --cdp http://127.0.0.1:9223 \
  --query '都灵 自然风光 美食' --limit 3 \
  --images \
  --output .local/travel-sources/turin.json
```

连接模式会新建采集标签页，结束时只关闭该标签页，保留原登录窗口。此方式的会话在上面指定的临时浏览器目录中；若需要长期保存，可自行指定 Linux 本地磁盘上的固定目录。

`--images` 同时下载帖子轮播图片到 JSON 旁的 `images/` 文件夹，可用 `--image-dir` 更改位置。适配器逐张切换轮播以加载延迟图片，仅下载帖子轮播中的图片，不抓头像、评论图片或推荐卡片。文件按内容 SHA-256 命名并保留实际格式；每帖最多 30 张，每张最多 8 MB。下载失败在 JSON 中保留状态，正文不受单张图片失败影响。保存的是网站当前提供的图片版本，不保证为相机原图。

登录后若网站跳转到 `rednote.com` 国际版，连接模式会使用已打开的国际版域名，并适配原读函数的搜索地址。国际版原帖保存为 `https://www.rednote.com/discovery/item/帖子ID`；两个域名按同一帖子 ID 去重。原读函数的导航等待改为 DOM 就绪，避免动态页面的资源加载拖住读取；仍保留原页面等待时间和有界超时。

第二个案例将查询词改为“因特拉肯 周末 自然风光 美食”，输出改为 `interlaken.json`。先采少量帖子，确认正文完整后再扩大。

运行失败时不会写入新导出；以前的文件可能仍在，使用时核对 `collected_at`。访问限制、验证提示和登录失效需人工处理；适配器不无限重试。采集会按帖子输出进度，不输出 HTML、登录状态或链接查询参数。

搜索没有可读取链接时，会生成同名 `.diagnostics.json`，仅包含时间、页面路径、帖子卡片数和提示是否出现，不保存正文或会话。根据诊断区分登录、访问限制和需要继续调查的空结果。

## 导入与查看

登录 TREK，打开 `/travel-sources`，选择生成的 JSON 文件。每批最多 100 条、文件最多 3 MB、每篇正文最多 20,000 字符。字段协议位于 `shared/src/travel-sources/travel-sources.schema.ts`。

若带图片，先导入 JSON，再通过“导入已下载图片”多选 `images/` 中的文件。素材卡片显示缩略图，点击可打开大图。图片单独上传，JSON 不包含图片二进制或临时 CDN 签名链接；服务器核对图片类型、内容摘要和帖子归属，只有所属账户能读取。

也可以直接将本地采集和图片导入本轮测试账户：

```bash
python3 scripts/travel-sources/import_rednote.py \
  --batch .local/travel-sources/turin-images.json \
  --account .local/travel-sources/local-account.json
```

此导入命令默认连接 `http://127.0.0.1:3001`，会输出导入数量，不输出账户密码。

正文成功读取仍不等于事实已核验。空正文、登录失败或读取失败会保留状态，不作为可用内容。标题、作者、发布时间和正文可查看；原帖链接移除查询参数，某些帖子仍可能要求本人登录后才能打开。

重复帖子按账户和帖子 ID 合并；更旧的采集或失败刷新不会覆盖已有成功内容。导入结果报告新增、更新和跳过数量。素材不会被其他 TREK 账户读取。

## 地点提取与地图候选

素材卡片中的“提取地点并匹配地图”会读取正文中明确的店名、`📍` 名称或“餐馆的名字是……”描述，保留原帖地址、特色、价格和营业时间的原文依据。当前是有边界的规则提取，尚不覆盖任意叙述、图片文字识别或跨帖地点合并；未写出的信息保持未知，不调用收费模型。

填写“地图搜索城市”（都灵案例默认 `Torino, Italy`）后，复用免费 Nominatim 搜索。优先按名称，空结果时按原帖地址寻找候选；每篇最多处理 12 个地点，每处最多展示 5 个候选，逐个请求并遵守现有地图限速。页面为这个操作保留最多三分钟的等待窗口，失败可重新匹配。

候选提供 OpenStreetMap 链接，并标出地址匹配、多个候选、街道或门牌差异。只有本人点击“确认是这个地点”才保存选中的地图位置；位置确认不等于价格、营业时间或帖子体验已核验。过短且没有地址的名称保留为待确认线索，不计入地点数，不进行地图猜测，也不能确认位置。人工查看已保存的图片后，可通过所属账户的图片补正接口填写完整名称、地址和图片依据；重新提取会保留相同正文版本下的补正。这不是自动图片 OCR。

结果按账户与来源正文指纹保存。刷新素材库可继续查看；正文变化时旧提取结果会提示过期并禁止确认。更换搜索城市后需重新匹配，卡片仍显示上次实际使用的城市。

## 交通覆盖探测

```bash
python3 scripts/travel-sources/probe_transit.py \
  --output .local/travel-sources/transit-coverage.json
```

探测当前数据覆盖，保存实际选择的地点和查询日期。默认 Bellinzona 出发是技术测试；第二个案例的真实出发地仍待明确。结果不证明历史时刻、票价、末班车或全部周边路线都正确。

2026-10-06 实测记录：以 2026-10-08 为测试日期，Bellinzona ↔ Torino Porta Nuova、Bellinzona ↔ Interlaken Ost 四个方向各返回 3 个公共交通候选。Turin 的真实验收案例为 2026 年 9 月、四天含往返；历史资料缺失时标为无法回溯核验。

## 验证命令

```bash
python3 -m unittest discover -s scripts/travel-sources -p 'test_*.py'
npm run build --workspace=shared
npm run test --workspace=server -- tests/unit/nest/travel-sources.test.ts tests/unit/nest/travel-places.test.ts
npm run typecheck --workspace=shared
npm run typecheck --workspace=server
npm run typecheck:tests --workspace=server
npm run typecheck --workspace=client
```

本轮采集适配器能离线验证，但小红书真实搜索/读取成功率必须在完成本人登录后再记录，不能根据代码存在推定成功。
