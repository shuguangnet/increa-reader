"""
Template system API routes
"""

from pathlib import Path
from typing import Dict, List

import aiofiles
from fastapi import HTTPException
from pydantic import BaseModel

from .models import WorkspaceConfig


class ApplyTemplateRequest(BaseModel):
    repo: str
    path: str


TEMPLATES: Dict[str, dict] = {
    "meeting-notes": {
        "id": "meeting-notes",
        "name": "会议记录",
        "description": "记录会议议题、讨论内容和行动项",
        "category": "工作",
        "content": """# 会议记录

**日期**: {date}
**参会人**: 

---

## 议程

1. 
2. 
3. 

## 讨论内容

### 议题 1

- 

### 议题 2

- 

## 行动项

| 任务 | 负责人 | 截止日期 | 状态 |
|------|--------|----------|------|
|      |        |          |      |

## 下次会议

- **时间**: 
- **议题**: 
""",
    },
    "weekly-review": {
        "id": "weekly-review",
        "name": "周报",
        "description": "总结本周工作并规划下周计划",
        "category": "工作",
        "content": """# 周报

**周期**: {date} ~ 

---

## 本周完成

- [ ] 
- [ ] 
- [ ] 

## 本周进展

### 项目 A

- 

### 项目 B

- 

## 遇到的问题

1. 
2. 

## 下周计划

- [ ] 
- [ ] 
- [ ] 

## 备注

- 
""",
    },
    "project-readme": {
        "id": "project-readme",
        "name": "项目 README",
        "description": "标准项目 README 文档模板",
        "category": "开发",
        "content": """# 项目名称

> 简短的项目描述

## 简介

详细描述项目的目的和功能。

## 功能特性

- 特性 1
- 特性 2
- 特性 3

## 安装

```bash
# 安装依赖
npm install
```

## 使用

```bash
# 启动项目
npm start
```

## 配置

| 参数 | 说明 | 默认值 |
|------|------|--------|
|      |      |        |

## 开发

```bash
# 开发模式
npm run dev

# 运行测试
npm test
```

## 贡献指南

1. Fork 本仓库
2. 创建特性分支
3. 提交变更
4. 发起 Pull Request

## 许可证

[MIT](LICENSE)
""",
    },
    "daily-journal": {
        "id": "daily-journal",
        "name": "日记",
        "description": "记录每天的心情、待办和想法",
        "category": "个人",
        "content": """# 日记 - {date}

## 心情

😊 / 😐 / 😢 / 😡 / 🤔

---

## 今日待办

- [ ] 
- [ ] 
- [ ] 

## 笔记

- 

## 感恩

1. 
2. 
3. 

## 明天的计划

- [ ] 
- [ ] 

---

*记录于 {date}*
""",
    },
    "api-reference": {
        "id": "api-reference",
        "name": "API 文档",
        "description": "记录 API 端点、参数和响应格式",
        "category": "开发",
        "content": """# API 文档

## 概述

API 基础 URL: `https://api.example.com/v1`

认证方式: Bearer Token

---

## 端点

### GET /api/resources

获取资源列表

**请求参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | integer | 否 | 页码，默认 1 |
| limit | integer | 否 | 每页数量，默认 20 |

**响应示例**

```json
{
  "data": [],
  "total": 0,
  "page": 1
}
```

### POST /api/resources

创建资源

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 资源名称 |
| type | string | 否 | 资源类型 |

**响应示例**

```json
{
  "id": 1,
  "name": "",
  "type": ""
}
```

### PUT /api/resources/:id

更新资源

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 否 | 资源名称 |

**响应示例**

```json
{
  "id": 1,
  "name": ""
}
```

### DELETE /api/resources/:id

删除资源

**响应**: 204 No Content

---

## 错误码

| 状态码 | 说明 |
|--------|------|
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务器错误 |
""",
    },
    "tutorial": {
        "id": "tutorial",
        "name": "教程",
        "description": "编写分步骤的教程文档",
        "category": "开发",
        "content": """# 教程标题

> 简要描述教程的目标和适用人群

## 前置条件

在开始之前，请确保你已具备：

- 条件 1
- 条件 2
- 条件 3

## 步骤 1: 准备环境

详细描述...

```bash
# 安装必要工具
```

## 步骤 2: 创建项目

详细描述...

```bash
# 创建项目
```

## 步骤 3: 编写代码

详细描述...

```python
# 示例代码
```

## 步骤 4: 运行和测试

详细描述...

```bash
# 运行
# 测试
```

## 步骤 5: 部署

详细描述...

## 常见问题

### 问题 1

**现象**: 

**解决方案**: 

### 问题 2

**现象**: 

**解决方案**: 

## 总结

- 要点 1
- 要点 2
- 要点 3

## 参考链接

- [链接 1]()
- [链接 2]()
""",
    },
}


def create_template_routes(app, workspace_config: WorkspaceConfig):
    """Create template API routes"""

    @app.get("/api/templates")
    async def list_templates():
        """List all built-in templates"""
        template_list: List[dict] = []
        for tid, tpl in TEMPLATES.items():
            template_list.append(
                {
                    "id": tid,
                    "name": tpl["name"],
                    "description": tpl["description"],
                    "category": tpl["category"],
                }
            )
        return {"templates": template_list}

    @app.get("/api/templates/{template_id}")
    async def get_template(template_id: str):
        """Get template content by ID"""
        tpl = TEMPLATES.get(template_id)
        if not tpl:
            raise HTTPException(
                status_code=404, detail=f"Template '{template_id}' not found"
            )
        return {
            "id": tpl["id"],
            "name": tpl["name"],
            "content": tpl["content"],
        }

    @app.post("/api/templates/{template_id}/apply")
    async def apply_template(template_id: str, body: ApplyTemplateRequest):
        """Apply a template to create a new file"""
        tpl = TEMPLATES.get(template_id)
        if not tpl:
            raise HTTPException(
                status_code=404, detail=f"Template '{template_id}' not found"
            )

        repo_config = next(
            (r for r in workspace_config.repos if r.name == body.repo), None
        )
        if not repo_config:
            raise HTTPException(
                status_code=404, detail=f"Repository '{body.repo}' not found"
            )

        file_path = Path(repo_config.root) / body.path

        # Security check: prevent path traversal
        try:
            file_path = file_path.resolve()
            repo_root = Path(repo_config.root).resolve()
            if not str(file_path).startswith(str(repo_root)):
                raise HTTPException(status_code=403, detail="Access denied")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid path")

        if file_path.exists():
            raise HTTPException(status_code=409, detail="File already exists")

        try:
            file_path.parent.mkdir(parents=True, exist_ok=True)
            async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
                await f.write(tpl["content"])
            return {"success": True, "path": body.path, "template_id": template_id}
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))