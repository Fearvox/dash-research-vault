# Dash Research Vault

> 多智能体研究知识库 — Evensong 风格记忆因果性 + Ebbinghaus 衰退 + L2 压力自进化

<p align="center">
  <a href="README.md">🇺🇸 English</a> · <a href="./README-zh.md">🇨🇳 中文</a>
</p>

---

<p align="center">

[![Research Vault](https://img.shields.io/badge/Research_Vault-161A1D?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Fearvox/dash-research-vault)
[![License: CC BY-NC-ND](https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-EF2D56?style=for-the-badge&logo=creative-commons&logoColor=white)](LICENSE)
[![Bilingual: EN+ZH](https://img.shields.io/badge/Bilingual-FF6B35?style=for-the-badge&logo=translate&logoColor=white)](README.md)
[![EverMind](https://img.shields.io/badge/EverMind.ai-00D4AA?style=for-the-badge&logo=brain&logoColor=white)](https://evermind.ai)

</p>

---

## 概述

实现 **Evensong 三大核心发现**的多智能体研究知识库：

| 发现 | 应用 | 机制 |
|------|------|------|
| 记忆因果性 | 知识库随时间积累 | 对话提取 → Admin 审核 → 写入 |
| 压力触发自进化 | 每个 agent 写入 L1 自驱标准 | #internal 交叉审核 |
| 递归污染控制 | 三层门控 (Agent→Admin→Researcher) | 写入需审核，防止低质信息自增强 |

[↑ 返回顶部](#dash-research-vault)

---

## 目录结构

```
dash-research-vault/
├── 00-overview/                 ← 知识库总览 + 4 张核心图表
├── 01-agents/                   ← 5 个 agent 角色定义
├── 02-channels/                 ← 6 种频道类型
├── 03-internal-only/            ← 隐私管控策略层
├── 04-memory/                   ← 三层记忆 + 衰退机制
│   ├── public/                  ← 所有 agent 可读
│   ├── restricted/              ← 仅 Admin 可达
│   └── .meta/                   ← 衰退元数据
└── docs/                        ← 研究论文
```

[↑ 返回顶部](#dash-research-vault)

---

## 核心图表

以下图表从 **Evensong R012-E** 基准测试论文提取。

### 图 1：集群分类学 (Swarm Taxonomy)

![Swarm Taxonomy](./00-overview/figures/fig1-swarm-taxonomy.png)

### 图 2：行为热力图 (Behavioral Heatmap)

![Behavioral Heatmap](./00-overview/figures/fig2-behavioral-heatmap.png)

### 图 3：记忆因果链 (Memory Causation Chain)

![Memory Causation](./00-overview/figures/fig3-memory-causation.png)

### 图 4：L2 压力自进化 (L2 Pressure Self-Evolution)

![L2 Pressure](./00-overview/figures/fig4-l2-pressure-timeline.png)

[↑ 返回顶部](#dash-research-vault)

---

## 研究论文

| 论文 | 语言 | 文件 |
|------|------|------|
| Evensong R012-E Benchmark | 英文 | [evensong-paper-en.pdf](./docs/evensong-paper-en.pdf) |
| Evensong R012-E Benchmark | 中文 | [evensong-paper-zh.pdf](./docs/evensong-paper-zh.pdf) |

[↑ 返回顶部](#dash-research-vault)

---

## 知识库层级

### 04-memory — 三层记忆

| 层级 | 读取权限 | 写入权限 | 衰退速度 |
|------|----------|----------|----------|
| `public/` | 所有 agent | 自由写入 | 快速 (difficulty=0.5) |
| `restricted/` | 仅 Admin | 审核门控 | 中速 (difficulty=2.0) |
| `internal-only/` | 仅 Researcher | 直接写入 | 慢速 (difficulty=4.0) |

### 03-internal-only — 策略层

包含敏感策略文档。无 agent 访问权限——仅 Researcher 可视。

[↑ 返回顶部](#dash-research-vault)

---

## 衰退算法

基于 **Ebbinghaus 遗忘曲线**，按 difficulty 加权：

```
retention(t) = e^(-t / (difficulty × half_life))
```

默认半衰期：**72 小时**

| Difficulty | 半衰期 | 示例 |
|------------|--------|------|
| 4.0 (核心) | 288h | 客户事实、行业数据 |
| 2.0 (技术) | 144h | 技术知识 |
| 0.5 (对话) | 36h | 对话摘录 |

[↑ 返回顶部](#dash-research-vault)

---

## 初始化

```bash
# 克隆知识库
git clone https://github.com/Fearvox/dash-research-vault.git
cd dash-research-vault

# 适配你的团队
# 替换 01-agents/ 中的 Agent 角色
# 配置 02-channels/ 中的频道名称
# 设置 04-memory/.meta/decay-config.md 中的衰退参数
```

[↑ 返回顶部](#dash-research-vault)

---

## 外部链接

| 资源 | 描述 |
|------|------|
| [EverMind.ai](https://evermind.ai) | 记忆与认知研究平台 |
| [Evensong Benchmarks](https://bench.zonicdesign.art/evensong) | 交互式基准测试可视化 |
| [DASH SHATTER](https://dash-shatter.vercel.app) | Agent 产品站点 |

---

## 语言版本

- [🇺🇸 English README](./README.md)
- [🇨🇳 中文 README](./README-zh.md)

---

**来源说明**: 此知识库模板作为 Evensong 研究项目的一部分创建。所有基准测试数据仅供内部自进化参考。
