# 措辞 × seed 敏感度矩阵

- 组合数: 8（seed 42/99 × 措辞 v1/v2/v3/v4），每组合 600 条（A100 B120 C80 D160 E80 F60）
- 措辞 v1 = 前两轮用的原文；v2/v3/v4 = 三种改写；criteria（选项定义）全程逐字不变。
- seed 变化 = 重新抽样（不同 case），不是重跑同一批。

## 1. 每个 (模型, 轨道) 在 8 个组合下的准确率分布

| 轨道 | 模型 | 均值 | 最小 | 最大 | 极差 | 标准差 |
|---|---|---|---|---|---|---|
| A_model_router | laya | 46.6% | 40.0% | 53.0% | 13.0pp | 4.2pp |
| A_model_router | jev | 49.0% | 47.0% | 51.0% | 4.0pp | 2.0pp |
| B_tool_selection | laya | 81.6% | 78.3% | 85.0% | 6.7pp | 2.2pp |
| B_tool_selection | jev | 100.0% | 100.0% | 100.0% | 0.0pp | 0.0pp |
| C_tool_guardrail | laya | 57.2% | 48.8% | 61.3% | 12.5pp | 4.5pp |
| C_tool_guardrail | jev | 75.3% | 67.5% | 81.3% | 13.7pp | 4.5pp |
| E_injection_guard | laya | 77.5% | 68.8% | 83.8% | 15.0pp | 4.9pp |
| E_injection_guard | jev | 90.3% | 83.8% | 93.8% | 10.0pp | 3.0pp |
| F_cardinality_multilingual | laya | 38.7% | 36.7% | 41.7% | 5.0pp | 1.6pp |
| F_cardinality_multilingual | jev | 80.0% | 76.7% | 83.3% | 6.7pp | 2.6pp |
| D_rag_gate | laya | 59.7% | 55.6% | 63.7% | 8.1pp | 2.9pp |
| D_rag_gate | jev | 62.9% | 57.5% | 68.1% | 10.6pp | 4.1pp |

## 2. 每个组合下 Jev − Laya 的差值（符号是否稳定 = 结论是否稳）

| 组合 | A | B | C | E | F | D | 全部 |
|---|---|---|---|---|---|---|---|
| s42/w1 | +4.0pp | +15.0pp | +15.0pp | +13.8pp | +46.7pp | -5.6pp | +10.7pp |
| s42/w2 | +2.0pp | +17.5pp | +20.0pp | +10.0pp | +45.0pp | +6.3pp | +14.0pp |
| s42/w3 | +3.0pp | +16.7pp | +11.3pp | +10.0pp | +43.3pp | +0.6pp | +11.2pp |
| s42/w4 | +7.0pp | +16.7pp | +28.7pp | +1.3pp | +43.3pp | +5.0pp | +14.2pp |
| s99/w1 | +1.0pp | +20.8pp | +16.3pp | +23.8pp | +41.7pp | +1.9pp | +14.3pp |
| s99/w2 | -2.0pp | +20.0pp | +21.3pp | +20.0pp | +38.3pp | +5.0pp | +14.3pp |
| s99/w3 | +0.0pp | +19.2pp | +7.5pp | +12.5pp | +36.7pp | +1.9pp | +10.7pp |
| s99/w4 | +4.0pp | +21.7pp | +25.0pp | +11.3pp | +35.0pp | +10.6pp | +16.2pp |

## 3. 结论稳定性判定

| 轨道 | 差值均值 | 差值最小 | 差值最大 | 8 个组合里 Jev 领先的次数 | 判定 |
|---|---|---|---|---|---|
| A_model_router | +2.4pp | -2.0pp | +7.0pp | 6/8 | 不稳 |
| B_tool_selection | +18.4pp | +15.0pp | +21.7pp | 8/8 | 稳（全胜且最小优势 >2pp） |
| C_tool_guardrail | +18.1pp | +7.5pp | +28.7pp | 8/8 | 稳（全胜且最小优势 >2pp） |
| E_injection_guard | +12.8pp | +1.3pp | +23.8pp | 8/8 | 方向稳（全胜但优势可能很小） |
| F_cardinality_multilingual | +41.3pp | +35.0pp | +46.7pp | 8/8 | 稳（全胜且最小优势 >2pp） |
| D_rag_gate | +3.2pp | -5.6pp | +10.6pp | 7/8 | 不稳 |
| ALL | +13.2pp | +10.7pp | +16.2pp | 8/8 | 稳（全胜且最小优势 >2pp） |
