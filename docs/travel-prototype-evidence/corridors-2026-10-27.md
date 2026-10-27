# 慕尼黑、威尼斯走廊交通覆盖实测

日期：2026-10-27。对应实施计划阶段 ② 的「慕尼黑、威尼斯走廊（先实测 Transitous 覆盖）」。命令：

```bash
python3 scripts/travel-sources/probe_transit.py --corridor munich --days-ahead 9 --output .local/travel-sources/transit-munich.json
python3 scripts/travel-sources/probe_transit.py --corridor venice --days-ahead 9 --output .local/travel-sources/transit-venice.json
```

测试出发时间为 2026-11-05 07:00 UTC（当地 08:00）。只证明当时的数据覆盖，不代表票价、实时延误或其他日期。

## 结果

| 走廊 | 区间 | 返回班次 | 前两个结果（UTC，用时，换乘，线路） |
| --- | --- | --- | --- |
| 苏黎世 ⇄ 慕尼黑 | Zürich HB → München Hbf | 5 | 07:03–11:55，292 分，2 次，RE48 → RE3 → FlixBus 001；07:03–11:51，288 分，3 次 |
| | München Hbf → Zürich HB | 3 | 07:05–11:33，268 分，1 次，EBU → EC 196 |
| 苏黎世 → 米兰 → 威尼斯 | Zürich HB → Milano Centrale | 3 | 07:28–10:51，203 分，直达，EC 31 |
| | Milano Centrale → Venezia S. Lucia | 3 | 07:14–09:47，153 分，直达，FR 9709 |
| | Venezia S. Lucia → Zürich HB | 3 | 07:15–13:32，377 分，2 次，FR 9716 → EC 150 |

三个车站都按名称定位到了 STOP 类型的站点。

## 结论与问题

- 两条走廊的往返都有可用班次，可以进入产品的「已核验」流程。威尼斯回程约 6 小时 17 分，符合计划中 3 天以上行程「单程 ≤ 7 小时」的边界。
- **慕尼黑去程的首选结果混入了 FlixBus 大巴**，而直达的 EC 火车没有排在前面。界面会列出每段线路，用户能看到是大巴，不算编造；但推荐质量要改进：后续可以按「火车优先、换乘少」重新排序，或者对瑞士段改用 OJP。
- 这两条走廊还**没有小红书素材**。下一步需要创始人采集或手动添加慕尼黑、米兰、威尼斯的帖子，再按都灵走廊的方法做提取和对照评测。
