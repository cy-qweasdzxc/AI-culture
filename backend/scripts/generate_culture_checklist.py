"""One-off generator for the culture source verification checklist.

Reads the current demo knowledge rows and emits a worksheet for human review.
It deliberately leaves every source URL blank: this project must not invent sources.
Not a test; kept out of app/ and tests/ on purpose.
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import select  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.models import CulturalKnowledge, CulturalLocation  # noqa: E402

# Institution *types* that would be authoritative for each subject. No URLs are suggested.
AUTHORITY_HINTS = {
    "pingjiang": "苏州市地方志编纂机构、苏州市文物保护管理部门、苏州博物馆公开资料、权威出版物（如《平江图》相关研究）",
    "ouyuan": "苏州市园林和绿化管理部门、世界遗产苏州古典园林官方资料、耦园管理机构公开介绍",
    "shizilin": "苏州市园林和绿化管理部门、世界遗产苏州古典园林官方资料、狮子林管理机构公开介绍、园林史学术论文",
    "zhuozhengyuan": "联合国教科文组织世界遗产中心名录页、苏州市园林和绿化管理部门、拙政园管理机构公开介绍、园林史学术论文",
    "subo": "苏州博物馆官方公开资料、苏州市文物保护管理部门、建筑与博物馆学公开资料",
}
TYPE_NOTE = {
    "fact": "史实：必须有可核对的权威来源，否则不得标记为已审核",
    "disputed": "争议：必须同时给出不同说法所依据的来源，不得只引用一方",
    "legend": "民间传说：必须标注为传说，且说明不具备史实来源",
    "fiction": "艺术化虚构：仅用于游戏剧情，不得作为文化事实对外引用",
}


def main() -> str:
    with SessionLocal() as db:
        spots = {spot.id: spot.name for spot in db.scalars(select(CulturalLocation))}
        rows = list(db.scalars(select(CulturalKnowledge).order_by(CulturalKnowledge.location_id, CulturalKnowledge.id)))
        lines = []
        lines.append("# 文化资料核对清单（供人工审核填写）")
        lines.append("")
        lines.append(f"生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}（北京时间）")
        lines.append("")
        lines.append("> **本清单不包含任何来源链接。** 项目不得凭空生成来源、授权声明、审核人或审核日期。")
        lines.append("> 请审核人逐条填入真实来源 URL 或纸质/馆藏出处，确认授权依据后，再通过管理端 `review` 接口标记为 `reviewed`。")
        lines.append("> 在来源核实完成前，这 14 条资料必须保持 `pending`，并且不会进入任何正式检索（`retrieval.py` 会直接跳过）。")
        lines.append("")
        lines.append(f"当前共 {len(rows)} 条，全部为 `review_status = pending`、`is_demo = True`、`source_url` 为空。")
        lines.append("")
        lines.append("## 汇总")
        lines.append("")
        lines.append("| # | 知识 ID | 点位 | 类别 | 标题 | 来源已填 | 授权已填 | 审核人 | 审核日期 |")
        lines.append("|---|---|---|---|---|---|---|---|---|")
        for index, row in enumerate(rows, start=1):
            lines.append(f"| {index} | `{row.id}` | {spots.get(row.location_id, row.location_id)} | {row.content_type} | {row.title} "
                         f"| ☐ | ☐ | ☐ | ☐ |")
        lines.append("")
        lines.append("## 逐条核对")
        lines.append("")
        for index, row in enumerate(rows, start=1):
            lines.append(f"### {index}. `{row.id}` · {spots.get(row.location_id, row.location_id)} · {row.content_type}")
            lines.append("")
            lines.append(f"- **标题**：{row.title}")
            lines.append(f"- **当前正文**：{row.content}")
            lines.append(f"- **类别含义**：{TYPE_NOTE.get(row.content_type, '')}")
            lines.append(f"- **当前 `source` 字段**：{row.source}（占位描述，不是真实来源）")
            lines.append(f"- **当前 `license` 字段**：{row.license}")
            lines.append(f"- **建议核对的权威机构类型**：{AUTHORITY_HINTS.get(row.location_id, '权威文博机构公开资料')}")
            lines.append("")
            lines.append("| 待填字段 | 请填写 |")
            lines.append("|---|---|")
            lines.append("| 真实来源名称（机构 / 出版物） |  |")
            lines.append("| 来源 URL 或馆藏编号 |  |")
            lines.append("| 资料发布日期（如可得） |  |")
            lines.append("| 授权或使用依据 |  |")
            lines.append("| 正文是否与来源一致（是/否/需修改） |  |")
            lines.append("| 需要修改的正文表述 |  |")
            lines.append("| 是否需要进一步核实 |  |")
            lines.append("| 审核人姓名 |  |")
            lines.append("| 审核日期 |  |")
            lines.append("")
        lines.append("## 审核完成后的操作")
        lines.append("")
        lines.append("1. 在管理端用 `PUT /api/admin/knowledge/{id}` 更新 `source`、`source_url`、`license` 等字段（`version` 必须匹配，修改会自动撤销既有审核与索引）。")
        lines.append("2. 用 `POST /api/admin/knowledge/{id}/review`，带 `version`、`status=reviewed`、`reviewer`、`confirm_sources=true`。")
        lines.append("3. 用 `POST /api/admin/knowledge/{id}/publish` 建立索引；配置了 Embedding 时会同时生成向量。")
        lines.append("4. 索引建立后，运行 `python scripts/evaluate_retrieval_arms.py` 产出真实的三臂检索对照数据。")
        lines.append("")
        lines.append("## 不得做的事")
        lines.append("")
        lines.append("- 不得因为「要跑通演示」而把 14 条演示资料批量改为 `reviewed`。")
        lines.append("- 不得填写无法打开的链接或凭印象编造的机构页。")
        lines.append("- 不得代填审核人姓名与审核日期。")
        lines.append("- 不得把 `fiction`（虚构）条目当作文化事实对外引用。")
        lines.append("")
        return "\n".join(lines) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", nargs="?", type=Path,
                        default=BACKEND.parent / "docs" / "competition" / "culture-source-checklist.generated.md")
    parser.add_argument("--overwrite", action="store_true", help="Explicitly replace the selected output file.")
    args = parser.parse_args()
    output = args.output
    if output.exists() and not args.overwrite:
        parser.error("Output already exists. Choose a new path or explicitly pass --overwrite; reviewed source worksheets must be preserved.")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(main(), encoding="utf-8")
    print(json.dumps({"output": str(output.resolve())}, ensure_ascii=False))
