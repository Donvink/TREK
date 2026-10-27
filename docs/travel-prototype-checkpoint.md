# 旅行规划原型：续做断点

更新：2026-10-27。下一次会话先读本文件，再读[实施计划](travel-prototype-implementation-plan.md)和验证记录。

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

**阶段 ① 的都灵走廊已端到端跑通（2026-10-27）**：导入帖子 → 本地 OCR → OCR 加大模型提取 → 地点池取舍 → 生成 TREK 行程 → 交通三态核验 → 规划器里的「攻略依据」。

- **OCR 与提取**：3 篇真实都灵帖子、34 张图。方案 B（本地 RapidOCR + `gemini-3.1-flash-lite`）提取出 6/6 个正确地点，House Jia 的完整名称和地址自动从第 10 张名片图读出，不再需要人工补正；方案 C（多模态直接看图）5/6 且成本约为 3 倍。每篇约 $0.0015。见 [实测记录](travel-prototype-evidence/ocr-llm-extraction-2026-10-27.md)。
- **防编造**：模型的每条引用都要逐行出现在正文或标注的图片 OCR 里，名称和地址按词核对，对不上的丢弃或标「需核对」。
- **地点池**：跨帖合并、按侧重和评价推荐并写明理由；保留和划掉记为偏好信号（`travel_preference_signals`，供阶段 ② 的画像使用）。
- **生成行程**：写入标准 TREK 行程（trip、places、assignments），按地理位置分天；往返火车按出行当天查询 Transitous，写成当天备注；1.2 km 内按步行估算。演示计划「都灵美食周末（演示）」2026-11-13 至 15：去程 08:02–12:10、回程 16:45–19:58 均「已核验」，5 个地点排入日程，la parentesi bistrot 在 OSM 找不到、未排入。
- **攻略依据**：桌面 `PlaceInspector` 和手机 `MPlaceSheet` 显示来源帖子、原文和图片引用、地图位置状态、相关交通，已用浏览器截图确认。
- **花费**：累计模型花费约 $0.04（应用内记录 $0.018，另有调试和对照调用）。
- **测试**：新增服务端测试 5 个文件、客户端 4 个文件；House Jia 等实测数据保存在 `.local/`。
- 之前完成的：本地 rednote_mcp 只读采集、素材库、TREK 公告与打赏入口删除。

**阶段 ② 和阶段 ③ 的工程部分已完成（2026-10-27）**：

- **手动添加攻略**：粘贴链接和正文，上传或粘贴截图；服务器端 OCR 服务（`deploy/ocr`，设置 `TREK_OCR_URL` 后启用）在上传时识别图片文字；素材可删除，连带图片、识别文字和地点。
- **旅行画像** `/travel-profile`：5 个问题；地点池按喜欢和不喜欢的类型、去过的地方、想避开的东西排序并写明理由；从取舍和修改后的行程推断出的偏好只作为建议，确认后才写入；每条记录可删除，可一键清空。
- **天气**：生成时为户外地点配附近的室内备选；「按天气检查」在预报窗口内对雨天给出替换建议，确认后在 TREK 行程里原位替换，并重新核验当天交通；超出预报窗口只显示历史同期参考。
- **住宿**：按城市推荐住宿区域并说明理由，附 Booking 和地图搜索链接（不带佣金参数）；填入订好的酒店后，建立 TREK 住宿记录，并核验每天往返酒店的交通。
- **付费意愿测试**：第三份计划起，生成前询问 CHF 4.90/份是否可接受，并写明不收费、照常生成。
- **使用指标**：拦截器按用户记录各操作的次数、耗时、成败和关键数字；管理员在「攻略行程」页查看。
- **部署配置** `deploy/`：从本分支构建 TREK，加 OCR 服务和 Caddy HTTPS，附中文部署说明。本机没有 Docker，只做过语法检查。
- **走廊实测**：慕尼黑、威尼斯两条走廊都有班次，见 [走廊实测](travel-prototype-evidence/corridors-2026-10-27.md)；城市间交通改为按「用时 + 换乘 + 长途大巴」打分，避免首选大巴。
- **测试**：服务端全量 13,072 个通过；客户端除上游原有的 71 个失败外全部通过。

**需要创始人本人做的**：

- 对照评测：ChatGPT 和小红书 AI 两列，见 [对照评测基线](travel-prototype-evidence/comparison-baseline-turin.md)。
- 慕尼黑、米兰、威尼斯的小红书帖子：用采集器（需要你的登录）或「手动添加攻略」。
- 演示视频和 >>venture>> 申请（11/30 截止）。
- 阶段 ③：买 VPS 和域名并按 `deploy/README.md` 部署（第一次构建后逐项验证），招募 5–8 位真实用户。

证据：[首批验证](travel-prototype-evidence/first-integration.md)、[House Jia 修正](travel-prototype-evidence/jia-correction-2026-10-07.json)、[OCR 与提取实测](travel-prototype-evidence/ocr-llm-extraction-2026-10-27.md)、[对照评测基线](travel-prototype-evidence/comparison-baseline-turin.md)。

## 下一步按顺序做

1. **创始人运行对照评测**并填表；若 ChatGPT 在事实错误和不可行安排上持平，按实施计划 7.1 调整申请叙事。
2. **补慕尼黑、威尼斯素材**，按都灵的方法提取、生成，并对照评测。
3. **录演示视频**（11/20 前后）：手动添加攻略 → 提取 → 地点池取舍（画像生效）→ 生成 → 天气检查 → 设住宿 → 在 TREK 里看攻略依据。演示用未来日期的计划。
4. **写并提交申请**：11/25 起只修阻塞问题，11/30 前由创始人审核后提交。
5. 阶段 ③：部署到 VPS，招募真实用户，用管理员指标页跟踪。

## 代码与数据在哪里

| 范围 | 路径 |
| --- | --- |
| 采集、图片下载、导入、OCR、交通探测、多模态对照 | `scripts/travel-sources/`（`ocr_images.py`、`compare_vision.py`） |
| 本地原型 API 启动器 | `scripts/travel-sources/run_local_api.py` |
| 协议与类型 | `shared/src/travel-sources/`，根 barrel 已导出 |
| 后端素材、提取、计划与核验 | `server/src/nest/travel-sources/`（`travel-llm`、`llm-extract-places`、`travel-pool`、`travel-itinerary`、`travel-plans`） |
| SQLite 表 | `server/src/db/schema.ts`：travel_sources、travel_source_images、travel_source_image_texts、travel_place_extractions、travel_plans、travel_pool_decisions、travel_preference_signals、travel_place_evidence、travel_llm_usage |
| 页面、hook、地点展示 | `client/src/pages/TravelSourcesPage.tsx`、`client/src/pages/travel-sources/`；攻略行程 `client/src/pages/TravelPlan(s)Page.tsx`、`client/src/pages/travel-plan/`；攻略依据 `client/src/components/TravelGuide/` |
| 测试 | `server/tests/unit/nest/travel-*.test.ts`；`client/src/pages/TravelPlanPage.test.tsx`、`client/src/pages/travel-plan/`、`client/src/components/TravelGuide/` |
| 路由与入口 | `client/src/App.tsx`、`client/src/components/Layout/Navbar.tsx` |
| 私有真实数据 | `.local/travel-sources/prototype.sqlite`、`turin-images.json`、`images/` |
| 本地账户 | `.local/travel-sources/local-account.json`，不要输出或提交其内容 |
| 本地检查图 | `.local/travel-sources/jia-corrected.png` 等 |

图片补正接口：`POST /api/travel-sources/:sourceId/places/:placeId/image-identity`，正文 `{name, address, image_id, evidence}`。只接受所属账户、所属素材已保存的图片。地图匹配：`POST .../:sourceId/places/extract`，`{city, refresh_map}`；确认：`POST .../:placeId/confirm`，`{candidate_id}`。提取格式现为 version 2，支持旧版显示。

## 新会话恢复顺序

1. 仓库已于 2026-10-27 从 `/mnt/d/projects/TREK` 迁到 Linux 文件系统 `~/projects/TREK`（测试和构建快数倍）；旧目录只作备份，不要在里面继续改。确认在新位置，查看 `git status --short`，读取本文件和相关代码。工作在分支 `feat/travel-prototype`（已推送到 fork `origin` = Donvink/TREK；`upstream` 是 liketrek/TREK，不要推送到上游）。不要 reset、clean 或覆盖现有修改。`docs/personal-travel-guide-assistant-design.md`、`docs/swiss-tourism-options/`、`docs/swiss-tourism-venture-design.md` 是原有用户文件，保留。
2. 先检查 3001 和 5173 是否已运行，避免重复启动。已有依赖可直接用；不要无故重新 `npm ci`。如果需要构建，**先等待 shared 构建结束，再执行 server 构建、测试或类型检查**；shared 清理 dist 时并行检查会报暂时缺失的导出错误。
3. 需要重启 API 时，在仓库根目录执行 `python3 scripts/travel-sources/run_local_api.py`（`--port 3002` 可换端口，原版体验实例占着 3001）。它使用当前原型数据库和账户，日志写 `.local/travel-sources/api.log`。不再依赖 `/tmp/trek-start-api.py`。不要无故换数据库；否则看不到真实素材与 House Jia 补正。
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

> 在 ~/projects/TREK 继续旅行规划原型。先读取 docs/travel-prototype-checkpoint.md、实施计划和验证记录，检查现有代码与私有数据库，不重做 grilling，不覆盖当前修改。都灵走廊已端到端跑通；从断点“下一步”继续（阶段 ② ③ 的工程部分）。按文档恢复本地服务并验证；缺少登录或模型调用信息时一次问一个关键问题。
