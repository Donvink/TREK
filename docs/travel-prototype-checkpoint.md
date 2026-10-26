# 旅行规划原型：续做断点

更新：2026-10-07。下一次会话先读本文件，再读实施计划和验证记录。用户暂时停止本轮开发，之后另开会话续做；不要自行开始下一阶段。

## 目标与已确认边界

基于 TREK 与用户已有 rednote_mcp，开发面向瑞士出发中文旅行者的本地规划原型，参加 >>venture>> 2027。用户独立开发，每天至少 5 小时，额外预算上限 CHF 50；规划免费，预订佣金尚为商业假设。grilling 已完成，不重新做整轮访谈。完整决策以 [实施计划](travel-prototype-implementation-plan.md) 为准。

最终流程：自动搜攻略 → 理解正文和图片中的地点 → 按偏好给三个方案 → 展开每日安排、公共交通与住宿 → 用户确认天气调整 → 可修改并下载攻略卡片。当前只完成采集、素材查看和地点提取首版。

案例一：Bellinzona → Turin，2026 年 9 月，两人，四天含往返，公共交通，自然风光与美食，包含一天周边自然风光。具体日期、预算、步行强度及住宿尚缺。现在已经是 10 月，这是历史验收案例；不能拿当前班次、价格或天气冒充历史事实。

案例二：因特拉肯及周边周末游；出发地、日期、人数、预算等仍待补充，不能复制第一案的所有条件。

## 已完成、实测与未完成

- 已跑通本地 rednote_mcp 只读适配器，真实采集并导入 3 篇都灵餐饮帖子、34 张图片。素材按账户隔离，去重、正文指纹、失败刷新保护和图片摘要校验已实现。
- `/travel-sources` 可搜索、查看格式化原文、图片、来源、地点卡片、原文依据和地图候选。地图位置必须用户确认；价格、营业时间和主观体验仍未核验。
- 地点抽取是显式店名/地址的规则提取，不是通用模型理解，也没有自动 OCR。缺少地址的短名称是待确认线索，不能计为已识别地点或确认位置。
- **重要纠错**：“都灵 中餐厅”正文简称“家”，第 10 张名片图片才有完整名称 **House Jia** 和 **Via Giuseppe Luigi Passalacqua, 4/A, 10122 Torino**。已人工读图，并核对 https://housejia.it/，通过图片补正接口写回真实数据库。再次提取保留补正；界面有图片依据链接。不要覆盖回“家”，也不要称为自动 OCR 成果。
- 当前 6 个地点：House Jia、la parentesi bistrot，以及大卖场帖中的 4 家店。House Jia 和 Al Jazira 有名称地图候选（Al Jazira 有街道差异）；另 3 家仅地址候选；la parentesi bistrot 未找到。均没有替用户确认。候选不等于事实核验成功。
- 交通探测曾以明确标注的测试日期查到两案往返候选，仅是覆盖证据；没有完成历史票价、日卡、末班车或接续核验。
- 18 项相关后端测试通过；shared/server 构建、客户端类型、服务端测试类型及相关静态检查通过。真实浏览器验证了 House Jia 名称、地址和图片依据。旧验证记录中的“6 个地点、4 个候选按钮”为纠错前状态，以最后的 House Jia 修正记录为准。
- 尚未完成：自然风光与因特拉肯素材、自动图片识别、人工纠正表单、跨帖地点合并、偏好筛选、三方案、每日行程、交通事实核验、酒店、天气调整、导出、模型接入与成本测量。

证据：[首批验证](travel-prototype-evidence/first-integration.md)、[House Jia 修正](travel-prototype-evidence/jia-correction-2026-10-07.json)。图片补正目前是 API 能力，尚无前端编辑表单。

## 下一步按顺序做

1. **先补齐素材理解与纠正闭环**：给地点卡片增加人工补正入口，复用已有图片补正接口；允许明确选择依据图片、填写完整店名与地址。检查正文、图片、地图之间的冲突。探索图片文字识别时，先确认可用的模型/本地 OCR 和费用，再做少量真实图片验证；不能把开发助手的人工读图当作已接入应用的识别功能。完成标准：House Jia 无需临时脚本即可在页面补正，刷新、重提取后仍保留证据，身份不明时不会猜店名。
2. 补采少量都灵周边自然风光与因特拉肯帖子，带正文和图片，人工检查地点名/地址/证据，再测试提取。保留已经导入的 3 篇真实素材。本人登录失效时提示用户完成登录；不要反复打开主页导致会话变化。
3. 补齐两案必要输入，确定预算内的应用模型调用方式，然后实现偏好表单和三个体验侧重不同的方案。每个地点保留来源、选择理由、未核验事项；随后接每日行程和交通核验。完整优先级与范围见实施计划。2026-10-21 新增长期画像（参考 career-ops，见设计文档 5.1）：做偏好表单时直接写入按账户保存的画像，并把选择/拒绝/锁定记为偏好信号；画像整理与校准建议后续再做。

优先修复输入质量再做三方案，避免把错误店名直接送入规划。可继续做独立工作；确实缺少信息时一次问一个关键问题。

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

1. 确认仓库仍为 `/mnt/d/projects/TREK`，查看 `git status --short`，读取本文件和相关代码。当前变更**未提交**，基础 HEAD 为 `1c05ee4b`。不要 reset、clean 或覆盖现有修改。`docs/personal-travel-guide-assistant-design.md`、`docs/swiss-tourism-options/`、`docs/swiss-tourism-venture-design.md` 是原有用户文件，保留。
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

本地 `.local/` 已被 Git 忽略；源码未提交是当前状态，后续若做 Git 检查点，先审查明确的文件集合，避免把原有用户文档、个人数据、凭证或会话一并添加。不要依赖聊天历史或 `/tmp` 辅助脚本续做。

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
