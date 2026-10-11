# 审查与继续开发入口

当前基线HEAD：fcb5ed4e48a533d421b33190dbb87554f4286a4b；本地修改尚未提交。先查看Git状态，不从远端覆盖，不清理用户数据库或.env，不自动push/部署/报名上传。

1. 阅读[最终审计](docs/final-audit.md)掌握DONE/IMPLEMENTED/PARTIAL/BLOCKED/TODO及优先级。
2. 对照[实施进度](docs/implementation-progress.md)、[实际测试](docs/test-results.md)；DeepSeek日志保留为历史，不能代替当前执行。
3. 启动与配置用[README](README.md)、[开发说明](DEVELOPMENT.md)；已有backend/.venv，默认Mock/Embedding=none，管理端必须私密密码和>=32字符签名密钥。
4. 正式文化推进从[逐条来源核对](docs/competition/culture-source-checklist.md)和data/raw/culture-source-candidates.json开始；14候选仍待许可及真正人工审核，不能批量reviewed。
5. AI实验参考[无费用工具审计](docs/evaluation-tool-audit-2026-10-10.md)。默认预检；--allow-paid-calls只有获该次明确费用授权后使用。本轮用户选择先完成无费用工具。
6. 本轮仅维护技术工程；竞赛材料和正式文化审核由其他成员负责。原始DOCX、官方PDF及GitHub原有协作资源受保护。此前AI生成的冗余参赛材料和ZIP清理后不再作为入口；本轮双重快照、一次性恢复副本及四份审计文件统一在`D:/Code/AIC-maintenance/`。

后端命令在backend运行：.venv/Scripts/python.exe -m pytest -q，以及-m ruff check app tests scripts。前端在frontend运行npm.cmd run lint / test / build / test:e2e。浏览器E2E仅用隔离测试库与合成管理账号，禁止针对真实内容库把测试夹具标为审核资料。当前机器Docker/Podman不可用、WSL未安装；离线PG SQL编译不等于实际迁移验收。
