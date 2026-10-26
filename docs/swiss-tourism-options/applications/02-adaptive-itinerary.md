# 02｜天气与交通动态行程助手：>>venture>> 2027 英文申请草稿

> 日期：2026-10-06｜独立创始人：Leo (Yudong) Zhong｜状态：比较草稿，尚未提交
>
> 依据创始人提供信息：瑞士定居、B Permit；本旅游项目尚无访谈、用户或收入。原项目方案见 [产品与技术设计](../02-adaptive-itinerary.md)。
>
> 只复制各英文代码块内的文字；标题、字符数、说明不属于申请正文。方括号市场数据需要核实替换；编辑后重新计数。融资、月度费用与正式产品名仍待确认。十份是备选，不能把同一创业项目以十个版本重复提交。

## Describe your startup (not confidential)

字符数：301｜限制：100–500（含空格）

```text
We are designing an adaptive Swiss travel assistant that checks an existing itinerary against weather, transport and user constraints. It identifies affected activities, preserves locked bookings and proposes explained alternatives. Travelers compare changes and explicitly confirm a new plan version.
```

## Innovation (confidential)

字符数：934｜限制：500–1500（含空格）

```text
A trip can become impractical after a weather change, delayed connection or reduced walking capacity. Travelers must reconcile several information sources while remembering fixed bookings. Our core innovation is constraint-preserving adaptation: identify the affected time window, keep immovable commitments and suggest a small set of feasible replacements with visible trade-offs. Unlike a fresh AI itinerary, a proposal is tied to the original plan, evidence freshness and a specific version, and cannot silently alter external reservations. We will compare its usefulness with manual replanning and existing assistants. The intended lead is reliable change handling, curated local alternatives and distribution through travel-service partners. Code derived from TREK remains under AGPL; defensibility must come from maintained operations and validated user value, not an invented patent or proprietary claim over upstream features.
```

## Technology & Product (confidential)

字符数：1210｜限制：500–1500（含空格）

```text
This is a design-stage concept, not a deployed adaptive service. TREK offers existing itinerary, reservation, weather, transport and offline components; we propose a new impact-assessment and plan-version module. Structured constraints govern feasibility, while AI may explain results without inventing operational facts. The first release would cover one region, low-risk sightseeing, weather checks and user-triggered changes; transport-event automation depends on verified feed coverage. The six-week roadmap is interviews and historical cases, manual adjustments and data tests, then locked activities, proposals, versioned confirmation and a small trial. Later work may add opted-in notifications and agency tools. Technical risks are stale or incomplete feeds, timezone errors and conflicting updates. We will test idempotent confirmation, privacy and fail-safe retention of the original plan; we do not offer mountain-safety decisions or automatic rebooking. We plan to add an OJP 2.0 adapter to TREK's existing transit module, mapping Swiss journey queries to its common itinerary format for connection and return-time checks. API keys stay server-side; feed access and coverage remain to be validated.
```

## Team (confidential)

字符数：980｜限制：500–1500（含空格）

```text
I am Leo (Yudong) Zhong, a solo founder based in Zurich with a Swiss B permit. I have over five years of experience shipping production AI, including perception and tracking systems deployed on the XPeng MONA M03. I also built EuroJobHunter, a live job-matching SaaS using multi-provider LLM orchestration, autonomous pipelines and MCP tools, and won third prize in Intel's AI PC Innovation Application Competition for an on-device agent. I hold a master's degree from Shanghai Jiao Tong University. I will lead product, software delivery, data integration and initial customer interviews. These projects show production engineering and independent delivery; they are not tourism traction. I need travel-operations review and complementary transport/weather expertise; I will start with scoped collaborations before hiring. I currently have no co-founder or confirmed tourism partner. Hiring will follow pilot evidence and budget, with roles and commitments documented explicitly.
```

## Market (confidential)

字符数：943｜限制：500–1500（含空格）

```text
The beachhead is travelers spending two or three days in one Swiss region with a mix of outdoor and indoor activities; agencies are a possible paying channel. Switzerland recorded 43.9 million hotel nights in 2025, which is context, not our addressable customer count. We must establish [VERIFIED ELIGIBLE TRIP OR AGENCY COUNT] and the incidence of meaningful changes before estimating market revenue. Alternatives include weather apps, SBB, tourism websites, manual agency support and AI planners. Customers would choose us if preserving bookings and comparing feasible changes saves measurable replanning effort. No customer interviews, users or revenue exist for this tourism concept yet. We plan traveler and agency interviews, historical-case reconstruction and a limited live trial, separating simulated events from genuine disruptions. Data availability enables testing now, but successful access and willingness to pay remain unproven.
```

## Sustainability & Impact (confidential)

字符数：787｜限制：300–1500（含空格）

```text
Expected contributions are SDG 11 through more usable local mobility and SDG 12 through better-informed activity choices. Travelers may benefit from fewer abandoned days, while local operators may receive suitable alternative visits. We will measure valid change events, accepted and actually used proposals, replanning time and avoidable extra journeys against the original plan. No quantified impact results are available. At scale, benefit estimates will use observed events and adoption rather than assume every trip needs adjustment. Risks include unnecessary travel, inaccurate reassurance, unfair exposure of businesses and processing costs. We will preserve user confirmation, exclude safety-critical decisions and distinguish weather suitability from an operator's cancellation.
```

## Business (confidential)

字符数：929｜限制：500–1500（含空格）

```text
We plan to test CHF 9-19 for limited support on a short trip, with a separately disclosed CHF 29-49 manual-review option. A travel-service subscription at CHF 149-399 per month would be tested only with agencies that have recurring cases. Acquisition would start with regional accommodation or agency partners rather than broad advertising. This tourism venture has no users or revenue; funding and monthly burn still need confirmation. Proposed prices are not achieved sales. Six-week milestones are validated change cases, reliable data access, an MVP and first paid trials; medium-term expansion requires real event adoption. Unit economics include polling, API usage, content, manual review and customer support. Main risks are too few useful events, unreliable feeds, liability expectations and weak willingness to pay. We will shrink automation or retain manual service if reliability and contribution do not support scale.
```

## Video Introduction (optional)

建议录制 90–150 秒，须低于 5 分钟和 250 MB。当前没有本产品可用演示时，用设计原型并明确标注；已有其他项目不能冒充本旅游产品。

- 0–20 秒：你是谁、目标用户与一个具体问题。
- 20–90 秒：用标记为模拟的天气变化展示锁定预约、局部调整、确认版本和旧版本拒绝；真实案例单独展示。
- 90–120 秒：说明设计阶段、接下来如何验证和你的相关交付经验。
- 120–150 秒：简述商业模式、试点计划和下一步。

## Spotlight Award

建议：No（游客版）；旅行服务人员版若确实改善售后工作，可评估 Yes。

上述建议是对主题的产品分析，不是主办方资格判定。实际选择须对应真实业务；AI、商务旅客或一般节省时间本身不足以证明对齐。详见 [申请指南](README.md#spotlight-选择)。

## 提交前补齐

1. 确定唯一主方向、正式产品名和第一地区；核实方括号中的可服务市场人数或客户数量。
2. 明确融资、预算、每月成本，以及申请时真实开发阶段；目前价格均为实验假设。
3. 更新实际完成的访谈、试点和收入；没有就保留零验证表述。
4. 核对创始人成果的证明材料，准备 Swiss residency 和其他资格信息；不把个人旧项目数据记为本项目成果。
5. 完成竞品与来源核验，并用脚本重新检查正文字符数。

## 来源与证据

- 个人背景：创始人提供的简历，2026-10-06；没有加入电话、邮箱、出生日期或未经提供的旅游经验。
- 市场、SDG 与 Spotlight 的来源及适用范围见 [申请指南](README.md#来源与证据边界)。
- 技术实现、许可与赛事共同条件见 [共同基础](../00-common-foundation.md)。
