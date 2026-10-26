# 旅行规划原型：续做断点

更新：2026-10-26。下一次会话先读本文件，再读[实施计划](travel-prototype-implementation-plan.md)和验证记录。

## 目标与已确认边界

2026-10-26 完成第二轮 grilling，方案已重新确认，完整决策以[实施计划](travel-prototype-implementation-plan.md)为准，不再重做整轮访谈。要点：

- 定位：把小红书上的欧洲攻略，变成一份在当地真的走得通的行程。参加 >>venture>> 2027，初始申请截止 **2026-11-30 23:59 CET**。
- 用户：住在瑞士、用小红书做攻略的中文用户。范围是从瑞士出发、公共交通单程约 5 小时（1–2 天）或 7 小时（3 天以上）可达。
- 核验走廊：都灵、慕尼黑、米兰 → 威尼斯。11/30 前只打通都灵走廊。
- 流程：用户选目的地 → 用户导入攻略（自动抓取只用于原型）→ OCR + 大模型提取地点 → 地点池取舍 → 生成一份标准 TREK 行程 → 在 TREK 中查看与修改。
- 移出首版：系统推荐目的地、三个完整方案、图文卡片、后台天气监控、具体酒店推荐。
- 预算 CHF 50：大模型 CHF 25（设硬性上限），VPS 与域名 CHF 25（阶段 ③ 才花）。

Bellinzona → Turin（2026 年 9 月，两人，四天含往返，公共交通，自然风光与美食）仍是都灵走廊的历史验收案例；不能拿当前班次、价格或天气冒充历史事实。原来的因特拉肯周末案例已作废。

## 已完成、实测与未完成

- 已跑通本地 rednote_mcp 只读适配器，真实采集并导入 3 篇都灵餐饮帖子、34 张图片。素材按账户隔离，去重、正文指纹、失败刷新保护和图片摘要校验已实现。
- `/travel-sources` 可搜索、查看格式化原文、图片、来源、地点卡片、原文依据和地图候选。地图位置必须用户确认。
- 地点抽取目前是显式店名/地址的规则提取，没有 OCR，也没有接大模型；按新方案将替换为 OCR + 文本大模型。
- **重要纠错**：「都灵 中餐厅」正文简称「家」，第 10 张名片图片才有完整名称 **House Jia** 和 **Via Giuseppe Luigi Passalacqua, 4/A, 10122 Torino**。已人工读图，并核对 https://housejia.it/，通过图片补正接口写回真实数据库。不要覆盖回「家」，也不要称为自动 OCR 成果。它是 OCR 实测的现成对照样本。
- 当前 6 个地点：House Jia、la parentesi bistrot，以及大卖场帖中的 4 家店；均没有替用户确认地图位置。
- 交通探测曾以明确标注的测试日期查到都灵往返候选，仅是覆盖证据。
- 已删除 TREK 的版本公告弹窗与全部打赏入口。
- 尚未完成：OCR 与大模型提取、地点池、生成 TREK 行程、证据关联表与「攻略依据」区块、交通三态核验、OJP 接入、对照评测，以及阶段 ② ③ 的全部内容。

证据：[首批验证](travel-prototype-evidence/first-integration.md)、[House Jia 修正](travel-prototype-evidence/jia-correction-2026-10-07.json)。

## 下一步按顺序做

1. **OCR 实测**：用 3 篇都灵帖子（34 张图），比较「本地 OCR（如 PaddleOCR）+ 文本模型」与「多模态模型」各能正确提取几个地点、每篇成本多少。House Jia 必须能从第 10 张图识别出来。计价前查当前官方价格。结果写入 `travel-prototype-evidence/`，再定提取方案。若 CHF 25 处理不了约 100 篇帖子，暂停并请用户决定。
2. **对照评测基线**：同一批都灵帖子交给 ChatGPT（正文直接贴入）和小红书自带 AI，按实施计划 7.1 的五项指标记录。
3. 按实施计划阶段 ① 打通都灵走廊：提取 → 地点池（证据、理由、勾选划掉）→ 生成 TREK 行程 → 证据关联表与「攻略依据」区块 → 交通三态。
4. 11/20 前后录演示视频，11/25 起只修阻塞问题，11/30 前由用户审核后提交申请。

可以继续做独立工作；确实缺少信息时一次问一个关键问题。

## 代码与数据在哪里

| 范围 | 路径 |
| --- | --- |
| 采集、图片下载、导入、交通探测 | `scripts/travel-sources/` |
| 本地原型 API 启动器 | `scripts/travel-sources/run_local_api.py` |
| 协议与类型 | `shared/src/travel-sources/`，根 barrel 已导出 |
| 后端素材与提取 | `server/src/nest/travel-sources/` |
| SQLite 表 | `server/src/db/schema.ts`：travel_sources、travel_source_images、travel_place_extractions |
| 页面、hook、地点展示 | `client/src/pages/TravelSourcesPage.tsx`、`client/src/pages/travel-sources/` |
| 测试 | `server/tests/unit/nest/travel-sources.test.ts`、`travel-places.test.ts` |
| 路由与入口 | `client/src/App.tsx`、`client/src/components/Layout/Navbar.tsx` |
| 私有真实数据 | `.local/travel-sources/prototype.sqlite`、`turin-images.json`、`images/` |
| 本地账户 | `.local/travel-sources/local-account.json`，不要输出或提交其内容 |
| 本地检查图 | `.local/travel-sources/jia-corrected.png` 等 |

图片补正接口：`POST /api/travel-sources/:sourceId/places/:placeId/image-identity`，正文 `{name, address, image_id, evidence}`。只接受所属账户、所属素材已保存的图片。地图匹配：`POST .../:sourceId/places/extract`，`{city, refresh_map}`；确认：`POST .../:placeId/confirm`，`{candidate_id}`。提取格式现为 version 2，支持旧版显示。

## 新会话恢复顺序

1. 确认仓库仍为 `/mnt/d/projects/TREK`，查看 `git status --short`，读取本文件和相关代码。工作在分支 `feat/travel-prototype`（已推送到 fork `origin` = Donvink/TREK；`upstream` 是 liketrek/TREK，不要推送到上游）。不要 reset、clean 或覆盖现有修改。`docs/personal-travel-guide-assistant-design.md`、`docs/swiss-tourism-options/`、`docs/swiss-tourism-venture-design.md` 是原有用户文件，保留。
2. 先检查 3001 和 5173 是否已运行，避免重复启动。已有依赖可直接用；不要无故重新 `npm ci`。如果需要构建，**先等待 shared 构建结束，再执行 server 构建、测试或类型检查**；shared 清理 dist 时并行检查会报暂时缺失的导出错误。
3. 需要重启 API 时，在仓库根目录执行 `python3 scripts/travel-sources/run_local_api.py`。它使用当前原型数据库和账户，日志写 `.local/travel-sources/api.log`。不再依赖 `/tmp/trek-start-api.py`。不要无故换数据库；否则看不到真实素材与 House Jia 补正。
4. 在另一个终端启动前端：

   ```bash
   CHOKIDAR_USEPOLLING=1 CHOKIDAR_INTERVAL=5000 CHOKIDAR_BINARY_INTERVAL=5000 npm run dev --workspace=client -- --host 127.0.0.1 --port 5173
   ```

   页面：http://localhost:5173/travel-sources 。Windows 挂载目录冷启动可能需要几分钟；等待服务就绪。不要用短超时误判失败。开发 Service Worker 可能造成旧页面，必要时清理该站点的 Service Worker 或在浏览器测试中绕过。
5. 查询“都灵 美食 攻略”应有 3 篇真实素材；总素材 10 篇，另外 7 篇是明确标注的合成测试素材。House Jia 应保留完整名称、地址、图片依据。不要重新导入来替代正常回读或伪造登录成功。
6. 若继续采集，先检查 Python venv、原爬虫副本与 Chrome 会话。已验证副本：`.local/travel-sources/upstream/rednote_mcp.py`。此前 Chrome CDP 为 `http://127.0.0.1:9223`，profile 为 `/tmp/trek-rednote-login`；**这是临时目录，后续可能不存在或登录失效**。恢复方式见 [本地说明](travel-prototype-local-setup.md)，完成登录需用户本人操作。连接模式只关闭自己的采集标签页。

## 保存方式与检查

本轮另外制作私有恢复备份：`.local/travel-sources/checkpoints/2026-10-07-handoff/`，包含 SQLite 在线备份与本轮代码文件归档、manifest。数据库备份包含图片及补正记录，代码归档包含本轮新增的未跟踪文件；都不上传。默认继续使用当前工作区与当前数据库；**备份只在文件丢失时用于恢复，不直接覆盖新进展**。

本地 `.local/` 已被 Git 忽略。后续提交时，先审查明确的文件集合，避免把原有用户文档、个人数据、凭证或会话一并添加。不要依赖聊天历史或 `/tmp` 辅助脚本续做。

必要的相关验证：

```bash
npm run build --workspace=shared
# 上一条结束后再继续：
npm run build --workspace=server
npm run test --workspace=server -- tests/unit/nest/travel-places.test.ts tests/unit/nest/travel-sources.test.ts
npm run typecheck --workspace=client
npm run typecheck:tests --workspace=server
python3 -m unittest discover -s scripts/travel-sources -p 'test_*.py'
```

已知限制：原页面浏览器检查偶见 DexieError，未阻止素材页但完整离线能力尚未验收；地址冲突检测仍是字符串规则，对无逗号门牌等格式有限；图片补正与慢查询并发时的身份变更保护值得后续补齐；正文多地点与跨段关联需新增真实样本验证。不要把这些或接口存在说成完整规划能力已实现。

## 可直接复制的续做提示

> 在 /mnt/d/projects/TREK 继续旅行规划原型。先读取 docs/travel-prototype-checkpoint.md、实施计划和验证记录，检查现有代码与私有数据库，不重做 grilling，不覆盖当前修改。从断点“下一步”的第 1 项开始：完善带图片依据的地点补正界面与识别质量，再补自然风光素材。House Jia 已用第 10 张名片图片补正，必须保留。按文档恢复本地服务并验证；缺少登录或模型调用信息时一次问一个关键问题。
