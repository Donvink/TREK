# 10｜多人出游协调：>>venture>> 2027 英文申请草稿

> 日期：2026-10-06｜独立创始人：Leo (Yudong) Zhong｜状态：比较草稿，尚未提交
>
> 依据创始人提供信息：瑞士定居、B Permit；本旅游项目尚无访谈、用户或收入。原项目方案见 [产品与技术设计](../10-group-coordination.md)。
>
> 只复制各英文代码块内的文字；标题、字符数、说明不属于申请正文。方括号市场数据需要核实替换；编辑后重新计数。融资、月度费用与正式产品名仍待确认。十份是备选，不能把同一创业项目以十个版本重复提交。

## Describe your startup (not confidential)

字符数：279｜限制：100–500（含空格）

```text
We are designing a group-outing planner that privately collects dates, starting points, budgets and walking preferences, then finds feasible shared options. It explains trade-offs, supports versioned voting and turns an explicitly confirmed choice into a collaborative itinerary.
```

## Innovation (confidential)

字符数：882｜限制：500–1500（含空格）

```text
Group outings often stall while organizers reconcile dates, departure locations, budgets and comfort needs in chats. Our core innovation is a private-preference feasibility workflow that finds shared options before voting and explains why no common plan exists. Users can compare fairness objectives, such as reducing the longest individual journey versus total group travel, rather than accept an unexplained ranking. Changes create a new candidate version, so old votes cannot silently endorse a different plan. We will compare this with chat, date polls and existing group-planning tools. Our planned lead is trusted organizer workflows, reusable regional content and distribution to recurring groups. TREK collaboration is a foundation, not the new constraint solver. AGPL obligations remain, and we do not claim proprietary ownership of upstream voting or a patent on fairness.
```

## Technology & Product (confidential)

字符数：1142｜限制：500–1500（含空格）

```text
The product is at design stage with no group trials completed. We propose to build on TREK membership, chat, polls, costs and itinerary features, adding private preferences, bounded option enumeration, fairness explanations and confirmed-decision versions. Initial scope is three to eight people, a few dates and curated regional day activities; manual availability avoids access to complete calendars. The six-week roadmap is organizer interviews and manual group tasks, then invitations, privacy, feasible options, versioned voting and real trials. Medium-term work may focus on corporate organizers if that segment pays. Risks are low member response, no shared feasible plan, stale transport and preference exposure. We will test invitation scope, withdrawal, unknown budgets, old votes and duplicate confirmation. The MVP will neither collect money nor book external activities automatically. We plan to add an OJP 2.0 adapter to TREK's existing transit module, mapping Swiss journey queries to its common itinerary format for connection and return-time checks. API keys stay server-side; feed access and coverage remain to be validated.
```

## Team (confidential)

字符数：979｜限制：500–1500（含空格）

```text
I am Leo (Yudong) Zhong, a solo founder based in Zurich with a Swiss B permit. I have over five years of experience shipping production AI, including perception and tracking systems deployed on the XPeng MONA M03. I also built EuroJobHunter, a live job-matching SaaS using multi-provider LLM orchestration, autonomous pipelines and MCP tools, and won third prize in Intel's AI PC Innovation Application Competition for an on-device agent. I hold a master's degree from Shanghai Jiao Tong University. I will lead product, software delivery, data integration and initial customer interviews. These projects show production engineering and independent delivery; they are not tourism traction. I need organizer-user research and complementary community or corporate-sales expertise; initial collaborations will precede hiring. I currently have no co-founder or confirmed tourism partner. Hiring will follow pilot evidence and budget, with roles and commitments documented explicitly.
```

## Market (confidential)

字符数：895｜限制：500–1500（含空格）

```text
The beachhead is an organizer of a three-to-eight-person day outing, with friends and company teams as distinct customer hypotheses. We need [VERIFIED REACHABLE ORGANIZER OR COMPANY COUNT], annual activity frequency and tested spend before sizing the market. Alternatives include messaging groups, date polls, spreadsheets, TREK's existing collaboration and general AI tools. Users would choose us if constraint checking materially reduces organizer effort and produces an agreed plan, not merely another poll. Current software and transit data make prototyping possible, but neither group adoption nor willingness to pay is established. The tourism venture has no interviews, users or revenue. We plan organizer interviews, three to five manual groups and eight to ten actual trials. Preference completion, time to agreement, paid decisions and later actual outings will be reported separately.
```

## Sustainability & Impact (confidential)

字符数：801｜限制：300–1500（含空格）

```text
We aim to contribute to SDG 10 and SDG 11 by making differing mobility, time and affordability needs visible without exposing personal reasons. Participants benefit only if a mutually acceptable outing becomes possible; organizers may spend less coordination time. KPIs include preference completion, time to agreement, participation, withdrawals and actual outings compared with the group's previous approach. No impact results are established. At scale, estimates will use observed group decisions and inclusion feedback, not an algorithmic fairness score alone. Risks include pressure to disclose budgets, exclusion of harder-to-accommodate members, social coercion and extra travel. We will preserve consent, distinguish unknown responses from approval and require transparent participation rules.
```

## Business (confidential)

字符数：844｜限制：500–1500（含空格）

```text
We plan to test CHF 9-19 per group decision, with free member participation, and CHF 99-299 per corporate activity for bounded setup and support. An organizer subscription would wait for repeated use. Acquisition would begin through community organizers or company administrators rather than assumed viral growth. This venture has no users or revenue; funding and monthly costs still need confirmation. Six-week milestones are manual group cases, private-preference software, a confirmed-plan workflow and first paid trials. Costs include multiple-person transit requests, support and organizer acquisition. Main risks are free substitutes, member drop-off, rare use and no improvement beyond polling. We will measure agreement time, organizer labor and actual outings; a paid corporate niche may be preferable to a broad consumer subscription.
```

## Video Introduction (optional)

建议录制 90–150 秒，须低于 5 分钟和 250 MB。当前没有本产品可用演示时，用设计原型并明确标注；已有其他项目不能冒充本旅游产品。

- 0–20 秒：你是谁、目标用户与一个具体问题。
- 20–90 秒：不同出发地和日期求解共同方案，制造无解并请求自愿放宽；候选变更后旧投票失效，确认后生成行程。
- 90–120 秒：说明设计阶段、接下来如何验证和你的相关交付经验。
- 120–150 秒：简述商业模式、试点计划和下一步。

## Spotlight Award

建议：No（朋友出游版）；企业活动组织版可条件性 Yes，前提是实际减少组织劳动且为产品核心。

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
