# 投稿与发布指南

所有论文版本都从 `paper/src/`（共享正文）由 `paper/build_venues.py` 生成，产物在 `paper/dist/`。
改正文只改 `paper/src/*.tex`，然后重跑：

```bash
../.venv/bin/python paper/analysis.py        # 数字和图（数据有变时）
../.venv/bin/python paper/build_venues.py    # 全部版本；也可只建某几个：... build_venues.py arr-review tmlr-review
python scripts/make_packages.py 2.0.0        # 匿名补充材料 + Zenodo 包（先 git commit）
```

> **注意：同一时间只能投一个在审场所。** arXiv、GitHub、Zenodo 可以和任何一个在审投稿并存。

## 各版本一览

| 用途 | 上传的 PDF | 源码包 | 匿名 | 补充材料 | AI 使用声明 |
|---|---|---|---|---|---|
| **arXiv** | （arXiv 自己编译） | `arxiv-source.tar.gz` | 否 | GitHub 链接 | 有（arXiv 要求报告实质性使用） |
| **ARR / OpenReview → ACL 2027 或 NAACL 2027** | `arr-review.pdf` | `arr-review-source.zip` | 是 | `supplementary-anonymous.zip` | 有（ARR 要求：Acknowledgments + checklist E1） |
| ACL 录用后 camera-ready | `acl-final.pdf` | `acl-final-source.zip` | 否 | GitHub | 有 |
| **WWW 2027**（10/18 摘要，10/25 全文） | `www2027-review.pdf` | `www2027-review-source.zip`（Overleaf） | 是 | `supplementary-anonymous.zip` 或匿名仓库链接 | 匿名模式下 acmart 会隐藏 acks；投稿表单里按要求填 |
| **KDD 2027 D&B**（第二轮，预计 2027 年 2 月） | `kdd2027-db.pdf` | `kdd2027-db-source.zip` | 否（单盲） | GitHub | 有（ACM 要求） |
| **TMLR** | `tmlr-review.pdf` | `tmlr-review-source.zip` | 是 | `supplementary-anonymous.zip`（≤100MB） | 无（TMLR 不强制要求披露） |
| TMLR 风格 preprint（可选） | `tmlr-preprint.pdf` | `tmlr-preprint-source.zip` | 否 | GitHub | 有 |
| **ACM TIST**（期刊，随时投） | `tist.pdf` | `tist-source.zip` | 否 | GitHub | 有（ACM 要求） |
| 中文技术报告 | `tech-report-zh.pdf` | `paper/tex/tech-report-zh.tex` | 否 | — | — |

AI 使用声明的文字在 `paper/src/ack.tex`（一句话）。是否保留由作者决定；ACM（WWW/KDD/TIST）、ARR 和 arXiv 的现行规则都要求披露，未披露可能被撤稿或处罚。

## 1. GitHub

- 仓库：`https://github.com/David-DL-Space/sys1-eval`（当前 **private**）。
- 公开：`gh repo edit David-DL-Space/sys1-eval --visibility public --accept-visibility-change-consequences`，或在网页 Settings → Danger Zone。
- 双盲投稿的匿名链接：公开仓库后，在 https://anonymous.4open.science 用 GitHub 登录，添加该仓库，
  替换词填 `Jiawei`、`Li`、`David-DL-Space`、`davidlijiawei`，得到 `https://anonymous.4open.science/r/<id>`。
  如需在论文里写匿名链接：把 `paper/build_venues.py` 里的 `ANON_CODE` 改成 `\url{...}` 后重建。

## 2. arXiv

1. 注册/登录 arxiv.org。首次在 cs.CL 投稿可能需要 endorsement（找在 cs.CL 发过文的人背书）。
2. Start new submission → License 选 **CC BY 4.0** → 分类：主类 **cs.CL**，交叉 **cs.AI, cs.LG, cs.CR**。
3. 上传 `paper/dist/arxiv-source.tar.gz`（含 `main.tex`、`main.bbl`、`acl.sty`、`acl_natbib.bst`、`figures/`；arXiv 不跑 BibTeX，所以带了 .bbl）。
   源文件纯 ASCII，arXiv 用 pdfLaTeX 编译；**上传后务必检查它生成的预览 PDF**。
4. 元数据：
   - Title：Fast Models, Slow Evidence: A Paired and Self-Audited Evaluation of System-1 Decision Models for LLM Agent Harnesses
   - Authors：Jiawei Li
   - Abstract：从 `paper/src/abstract.tex` 复制，去掉 LaTeX 命令（`\laya{}`→Laya，`\jev{}`→Jev，`\%`→%，`\pp`→pp，`\codeurl{}`→仓库链接），≤1920 字符
   - Comments：`11 pages, 7 figures. Code and data: https://github.com/David-DL-Space/sys1-eval`
5. 美东时间工作日 14:00 前提交，一般当晚公开。拿到 arXiv 号后，把它加进 `CITATION.cff` / `.zenodo.json` 的 related identifiers。

## 3. ARR（OpenReview）→ ACL 2027 / NAACL 2027

1. OpenReview 账号：2026 年 10 月起要求完整资料（ORCID、机构经历、机构邮箱、DBLP 链接——你的 KDD 2018 论文可以关联）。无机构邮箱审核较慢，尽早注册。
2. 周期：**2026-10-12**（NAACL/COLING 2027）；ACL 2027 走 **2027 年 1 月**那一轮（以 aclrollingreview.org/dates 为准）。
3. 提交：PDF = `arr-review.pdf`；Software/Data = `supplementary-anonymous.zip`；Responsible NLP checklist 按 `paper/submission/ARR-responsible-nlp-checklist.md` 逐项核对后填写。
4. 作者须登记审稿（最多审 2 篇），截止后 48 小时内完成，否则 desk reject。
5. 评审结束后，在目标会议的 commitment 截止前 commit。

## 4. WWW 2027（The Web Conference）

- 摘要 **2026-10-18**，全文 **2026-10-25**（AoE）；方向建议 "Web Infrastructure and Agentic Systems"（或 "Security and Privacy"）。
- 双盲；正文 ≤8 页 + 参考文献/附录，总计 ≤12 页（当前 9 页）。
- ACM 模板请以官方最新 acmart 为准：把 `www2027-review-source.zip` 上传 Overleaf 的 ACM 模板项目即可。

## 5. KDD 2027 Datasets & Benchmarks

- 第二轮日期尚未公布（按往年约 2027 年 2 月）；单盲，署名；正文 ≤8 页，参考文献/附录不限（录用后 9+3 页）。
- 录用后须公开代码和数据（GitHub + Zenodo DOI 已满足）。
- 不要投 ADS track（要求上线后的线上效果数据）。

## 6. TMLR

- OpenReview 随时投稿，双盲；无页数上限（正文过长会拖慢审稿）。
- PDF = `tmlr-review.pdf`；补充材料 = `supplementary-anonymous.zip`（ZIP，≤100MB）。
- 录用后改用 `[accepted]` 选项、填写 `\month`、`\year`、`\openreview`（在 `build_venues.py` 的 `tmlr()` 里）。

## 7. ACM TIST

- ScholarOne（Manuscript Central）投稿；普通论文 ≤25 页含参考文献（当前 15 页）。
- 上传 `tist.pdf`（+ `tist-source.zip`）；cover letter 见 `paper/submission/TIST-cover-letter.md`。
- 2026 年 APC：无 ACM Open 机构时，非会员 $1,450 / ACM 会员 $950。

## 8. Zenodo（DOI）

两种方式，二选一：
- **GitHub 集成（推荐）**：仓库公开后，在 zenodo.org 用 GitHub 登录 → Settings → GitHub → 打开 `sys1-eval` 开关 →
  在 GitHub 上 `gh release create v2.0.0 --title "v2.0.0" --notes "Paper release"`。Zenodo 会按 `.zenodo.json` 自动生成记录和 DOI。
- **手动上传**：New upload → 上传 `paper/dist/zenodo-sys1-eval-v2.0.0.zip` → 元数据照 `.zenodo.json` 填 → Publish。

拿到 DOI 后加进 README 的 Citation 和论文的代码链接处。

## 9. 其他可选

- **Hugging Face Datasets**：把 `bench/` 做成数据集页面，便于他人直接加载（注意上游许可，非商用来源需在卡片里写明）。
- Google Scholar / Semantic Scholar 会自动收录 arXiv 版本；ORCID 里手动添加作品。
