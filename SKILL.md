# AutoClip — AI 视频切片 Skill

## 概述

AutoClip 是一个 AI 驱动的视频切片系统。支持从 YouTube / Bilibili 下载视频，使用 AI 自动分析内容、提取精彩片段、生成切片合集。

本 Skill 供 AI Agent 通过 API 自动完成：提交视频链接 → AI 分析处理 → 获取切片结果。

**应用地址**：https://autoclip.agentpit.io

---

## 新用户开通引导

1. 注册 AgentPit 账号：`https://www.agentpit.io/register`
2. 访问 AutoClip：`https://autoclip.agentpit.io`
3. 点击右上角「agentpit 授权登陆」完成 OAuth 授权

---

## OpenClaw 配置

```yaml
name: autoclip
description: AI视频切片 — 提交视频链接，自动分析并提取精彩片段
base_url: https://autoclip.agentpit.io

tools:

  # ============ B站视频一键处理（推荐） ============

  - name: bilibili_download
    description: 提交B站视频链接，自动下载+创建项目+启动AI处理
    method: POST
    path: /api/v1/bilibili/download
    body:
      - name: url
        type: string
        required: true
        description: "B站视频链接，如 https://www.bilibili.com/video/BVxxx"
      - name: project_name
        type: string
        required: true
        description: "项目名称"
      - name: video_category
        type: string
        required: false
        description: "视频分类：knowledge/entertainment/experience/opinion/business/speech，默认 default"

  # ============ YouTube视频一键处理 ============

  - name: youtube_download
    description: 提交YouTube视频链接，自动下载+创建项目+启动AI处理
    method: POST
    path: /api/v1/youtube/download
    body:
      - name: url
        type: string
        required: true
        description: "YouTube视频链接，如 https://www.youtube.com/watch?v=xxx"
      - name: project_name
        type: string
        required: true
        description: "项目名称"
      - name: video_category
        type: string
        required: false
        description: "视频分类，同上"

  # ============ 上传本地视频 ============

  - name: upload_video
    description: 上传本地视频文件创建项目
    method: POST
    path: /api/v1/projects/upload
    content_type: multipart/form-data
    body:
      - name: video_file
        type: file
        required: true
        description: "视频文件（mp4/avi/mov/mkv/webm）"
      - name: project_name
        type: string
        required: true
        description: "项目名称"
      - name: video_category
        type: string
        required: false
        description: "视频分类"
      - name: srt_file
        type: file
        required: false
        description: "字幕文件（可选，不传则自动语音识别）"

  # ============ 启动处理 ============

  - name: start_processing
    description: 启动AI处理流水线（上传方式需手动调用；B站/YouTube下载方式自动启动）
    method: POST
    path: /api/v1/projects/{project_id}/process
    parameters:
      - name: project_id
        in: path
        required: true
        description: "项目ID"

  # ============ 查询状态（需轮询） ============

  - name: get_processing_status
    description: 查询AI处理进度，需每3-5秒轮询直到completed或error
    method: GET
    path: /api/v1/projects/{project_id}/status
    parameters:
      - name: project_id
        in: path
        required: true
        description: "项目ID"

  # ============ 获取结果 ============

  - name: get_clips
    description: 获取项目的所有切片列表
    method: GET
    path: /api/v1/clips/
    parameters:
      - name: project_id
        in: query
        required: true
        description: "项目ID"

  - name: get_collections
    description: 获取项目的所有合集列表
    method: GET
    path: /api/v1/collections/
    parameters:
      - name: project_id
        in: query
        required: true
        description: "项目ID"

  # ============ AI优化 ============

  - name: generate_clip_title
    description: 让AI为切片生成更好的标题
    method: POST
    path: /api/v1/clips/{clip_id}/generate-title
    parameters:
      - name: clip_id
        in: path
        required: true
        description: "切片ID"

  - name: generate_collection_title
    description: 让AI为合集生成更好的标题
    method: POST
    path: /api/v1/collections/{collection_id}/generate-title
    parameters:
      - name: collection_id
        in: path
        required: true
        description: "合集ID"

  # ============ 项目管理 ============

  - name: get_projects
    description: 获取所有项目列表
    method: GET
    path: /api/v1/projects/

  - name: get_project
    description: 获取单个项目详情
    method: GET
    path: /api/v1/projects/{project_id}
    parameters:
      - name: project_id
        in: path
        required: true
        description: "项目ID"

  - name: retry_processing
    description: 重试失败的处理任务
    method: POST
    path: /api/v1/projects/{project_id}/retry
    parameters:
      - name: project_id
        in: path
        required: true
        description: "项目ID"

  - name: health_check
    description: 检查服务健康状态
    method: GET
    path: /api/v1/health/
```

---

## 完整工作流

### 方案A：从B站/YouTube链接处理（推荐，最简单）

```
1. 调用 bilibili_download 或 youtube_download
   → 返回 project_id（自动下载+自动启动AI处理）

2. 轮询 get_processing_status（每3-5秒）
   → 等待 status == "completed"
   → 6个处理步骤：大纲提取 → 时间轴 → 评分 → 标题生成 → 主题聚类 → 视频切片

3. 调用 get_clips 获取切片列表
4. 调用 get_collections 获取合集列表
5. （可选）调用 generate_clip_title / generate_collection_title 优化标题
```

### 方案B：上传本地视频

```
1. 调用 upload_video 上传视频文件
   → 返回 project_id

2. 调用 start_processing 启动AI处理

3. 后续流程同方案A的步骤2-5
```

---

## API 请求/响应示例

### 提交B站视频

```http
POST https://autoclip.agentpit.io/api/v1/bilibili/download
Content-Type: application/json

{
  "url": "https://www.bilibili.com/video/BV1xx411c7mD",
  "project_name": "AI技术解析",
  "video_category": "knowledge"
}
```

响应：
```json
{
  "id": "task_uuid",
  "url": "https://www.bilibili.com/video/BV1xx411c7mD",
  "project_name": "AI技术解析",
  "status": "pending",
  "progress": 0,
  "project_id": "project_uuid"
}
```

### 查询处理状态

```http
GET https://autoclip.agentpit.io/api/v1/projects/{project_id}/status
```

处理中响应：
```json
{
  "status": "processing",
  "current_step": 3,
  "total_steps": 6,
  "step_name": "内容评分",
  "progress": 50
}
```

处理完成响应：
```json
{
  "status": "completed",
  "current_step": 6,
  "total_steps": 6,
  "step_name": "视频切片",
  "progress": 100
}
```

### 获取切片结果

```http
GET https://autoclip.agentpit.io/api/v1/clips/?project_id={project_id}
```

响应：
```json
{
  "items": [
    {
      "id": "clip_uuid",
      "title": "AI大模型的三大突破",
      "start_time": 120,
      "end_time": 240,
      "duration": 120,
      "score": 0.92,
      "clip_metadata": {
        "outline": "讨论了AI大模型在...",
        "recommend_reason": "内容信息密度高，观点新颖"
      }
    }
  ],
  "total": 8
}
```

### 获取合集结果

```http
GET https://autoclip.agentpit.io/api/v1/collections/?project_id={project_id}
```

响应：
```json
{
  "items": [
    {
      "id": "collection_uuid",
      "name": "AI技术前沿精选",
      "description": "涵盖大模型、多模态、Agent等前沿技术要点",
      "clip_ids": ["clip_1", "clip_2", "clip_3"]
    }
  ],
  "total": 2
}
```

---

## 视频分类说明

| 分类 | 值 | 说明 |
|------|------|------|
| 默认 | `default` | 通用视频 |
| 知识科普 | `knowledge` | 科学、技术、历史、文化 |
| 娱乐 | `entertainment` | 游戏、音乐、电影 |
| 商业 | `business` | 商业、创业、投资 |
| 经验分享 | `experience` | 个人经历、生活感悟 |
| 观点评论 | `opinion` | 时事评论、观点分析 |
| 演讲 | `speech` | 公开演讲、讲座 |

---

## 错误处理

| HTTP 状态码 | 含义 | 处理方式 |
|-------------|------|----------|
| 200 | 成功 | 正常处理 |
| 400 | 参数错误 | 检查请求参数 |
| 404 | 资源不存在 | 检查项目/切片ID |
| 429 | 系统繁忙 | 等待后重试 |
| 500 | 服务器错误 | 查看日志或重试 |

---

## 使用示例（对话场景）

**用户**：帮我把这个B站视频切片 https://www.bilibili.com/video/BV1xx411c7mD

**Agent**：
1. 调用 `bilibili_download`，提交链接
2. 获得 project_id，开始轮询 `get_processing_status`
3. 等待处理完成（约3-10分钟，取决于视频长度）
4. 调用 `get_clips` 获取切片列表
5. 回复用户：处理完成，共生成8个精彩切片，包括...

---

**用户**：帮我分析一下这个YouTube演讲视频 https://www.youtube.com/watch?v=xxx

**Agent**：
1. 调用 `youtube_download`，video_category 设为 `speech`
2. 轮询处理状态
3. 完成后获取切片和合集
4. 回复用户：演讲共被分为N个主题片段，生成了M个合集...

---

## 相关链接

| 链接 | 说明 |
|------|------|
| https://autoclip.agentpit.io | AutoClip 应用首页 |
| https://autoclip.agentpit.io/docs | API 文档（Swagger） |
| https://www.agentpit.io/games | AgentPit 应用市场 |
