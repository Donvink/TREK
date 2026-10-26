# 03｜交通票券与行程优化：>>venture>> 2027 英文申请草稿

> 日期：2026-10-06｜独立创始人：Leo (Yudong) Zhong｜状态：比较草稿，尚未提交
>
> 依据创始人提供信息：瑞士定居、B Permit；本旅游项目尚无访谈、用户或收入。原项目方案见 [产品与技术设计](../03-ticket-optimizer.md)。
>
> 只复制各英文代码块内的文字；标题、字符数、说明不属于申请正文。方括号市场数据需要核实替换；编辑后重新计数。融资、月度费用与正式产品名仍待确认。十份是备选，不能把同一创业项目以十个版本重复提交。

## Describe your startup (not confidential)

字符数：311｜限制：100–500（含空格）

```text
We are designing a Swiss travel-ticket comparison tool that maps a fixed itinerary and passenger eligibility to a limited set of ticket combinations. A versioned rules engine checks coverage, retrieves available quotes and explains estimated cost, flexibility and unresolved conditions before official purchase.
```

## Innovation (confidential)

字符数：944｜限制：500–1500（含空格）

```text
Travelers can struggle to compare passes, individual tickets, discounts and booking restrictions across an itinerary. Our innovation is an explainable coverage model: each product is mapped to each journey segment with eligibility, validity and uncertainty, then combinations are compared under the same passenger and flexibility assumptions. This avoids presenting a cheaper but materially different journey as savings. Unknown coverage is excluded from verified cheapest-option claims. The planned advantage over a fare lookup or chatbot is transparent multi-product reasoning and reviewable assumptions. We will test a narrow product whitelist against official purchase conditions and human experts before extending it. Our lead would depend on a maintained rules library, verified edge cases and agency distribution. We will comply with TREK's AGPL requirements and data-source terms; we claim neither a patent nor guaranteed lowest prices.
```

## Technology & Product (confidential)

字符数：1182｜限制：500–1500（含空格）

```text
The product is currently a design-stage proposal using TREK's itinerary, transport and cost display as potential foundations. We propose a ticket-rule module, coverage matrix, bounded combination solver and quote adapters. OJP Fare is a candidate data service, not an already integrated source; access, limits and product coverage must be tested, and its quotes are non-binding. The initial scope is fixed itineraries and a small verified set of products, with explicit unknowns and official purchase links. Over six weeks we plan data checks, manually reviewed cases, rule implementation, comparison pages and limited paid reviews. Medium-term work would add products only with a sustainable update process. Risks are changing conditions, incomplete quotes, eligibility errors and user expectations. Tests will cover validity dates, overlapping benefits, missing fares and stale results; the MVP will not sell tickets or manage refunds. We plan to add an OJP 2.0 adapter to TREK's existing transit module, mapping Swiss journey queries to its common itinerary format for connection and return-time checks. API keys stay server-side; feed access and coverage remain to be validated.
```

## Team (confidential)

字符数：975｜限制：500–1500（含空格）

```text
I am Leo (Yudong) Zhong, a solo founder based in Zurich with a Swiss B permit. I have over five years of experience shipping production AI, including perception and tracking systems deployed on the XPeng MONA M03. I also built EuroJobHunter, a live job-matching SaaS using multi-provider LLM orchestration, autonomous pipelines and MCP tools, and won third prize in Intel's AI PC Innovation Application Competition for an on-device agent. I hold a master's degree from Shanghai Jiao Tong University. I will lead product, software delivery, data integration and initial customer interviews. These projects show production engineering and independent delivery; they are not tourism traction. I need an independent Swiss fare-rule reviewer and agency-market expertise before expanding beyond a verified product whitelist. I currently have no co-founder or confirmed tourism partner. Hiring will follow pilot evidence and budget, with roles and commitments documented explicitly.
```

## Market (confidential)

字符数：926｜限制：500–1500（含空格）

```text
The initial customer hypothesis is a visitor planning several public-transport travel days, with travel agencies as a second possible buyer. The market must be sized from [VERIFIED QUALIFYING TRIP OR AGENCY COUNT] and tested spend per comparison; total hotel nights are not equivalent to customers. Existing alternatives include SBB, Swiss Travel System information, operator websites, agency advice and manual spreadsheets. We would win only if transparent combination comparisons reduce uncertainty or establish useful differences under equal conditions. OJP Fare provides a potential entry for data testing now, but does not establish complete coverage or demand. Validation is planned rather than claimed: interviews, 15 manual comparisons and independent review of at least 30 boundary cases, followed by real paid tasks. The results will show both comparable cases and exclusions, rather than hide difficult itineraries.
```

## Sustainability & Impact (confidential)

字符数：805｜限制：300–1500（含空格）

```text
Potential contributions are SDG 11 through easier understanding of public-transport options and SDG 12 through informed purchasing. Travelers benefit if they avoid unsuitable tickets or unnecessary expense; agencies benefit from less review work. KPIs include independently verified comparisons, coverage completeness, corrected eligibility errors, review time and actual purchase decisions. No savings or impact results have been established. At scale, any financial benefit will compare identical travel conditions rather than cheaper restrictions disguised as savings. Negative effects include misleading quotes, encouraging unnecessary trips to exploit a pass and processing costs. We will disclose uncertainty, price timestamps and final-purchase differences and avoid automatic environmental claims.
```

## Business (confidential)

字符数：821｜限制：500–1500（含空格）

```text
We plan to test CHF 9-19 per itinerary comparison, CHF 39-69 for clearly disclosed human review, and CHF 149-299 per month for agencies with bounded usage. Acquisition starts with complex-trip communities and agency referrals; no ticket commission is assumed without an agreement. This tourism venture has no users or revenue; funding and monthly costs still need confirmation. Milestones are lawful data access, independently checked cases, a limited comparison MVP and first paid reviews. Cost drivers are quote requests, rule maintenance, expert review and support, not just hosting. Main risks are free official substitutes, insufficient product coverage, price changes and an unsustainable manual workload. We will limit claims to verified products and expand only when accuracy and per-case contribution support it.
```

## Video Introduction (optional)

建议录制 90–150 秒，须低于 5 分钟和 250 MB。当前没有本产品可用演示时，用设计原型并明确标注；已有其他项目不能冒充本旅游产品。

- 0–20 秒：你是谁、目标用户与一个具体问题。
- 20–90 秒：展示同等乘客、路线和灵活性下的组合比较，再修改已有票券；一个未知覆盖项明确保持待确认。
- 90–120 秒：说明设计阶段、接下来如何验证和你的相关交付经验。
- 120–150 秒：简述商业模式、试点计划和下一步。

## Spotlight Award

建议：No（游客购票顾问）；旅行社员工工具可按真实流程改善评估 Yes。

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
