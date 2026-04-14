---
name: dash-research-vault
description: "Multi-agent research vault with Evensong-style memory causation, Ebbinghaus decay, and L2 pressure self-evolution. Three-tier memory (public/restricted/internal), trigger-based agent activation, and 72-hour difficulty-weighted decay algorithm. For research teams building collaborative agent systems with structured long-term memory."
when_to_use: "When setting up a multi-agent research vault, managing shared memory across agents with decay, implementing Evensong-inspired self-evolution loops, or structuring research documentation with privacy tiers. Supports R012-E benchmark integration for internal self-evolution reference."
argument-hint: "[init|update|decay|loop] [--tier public|restricted] [--benchmark R0XX]"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - Agent
  - Skill
user-invocable: true
---

# Dash Research Vault

## 概述 | Overview

A multi-agent research vault implementing Evensong's three core findings:

| Finding | Application | Mechanism |
|---------|-------------|-----------|
| Memory Causation | Agent knowledge base accumulates over time | Dialogue extraction → Admin review → Write |
| Pressure-Triggered Self-Evolution | L1 self-drive criteria in each agent description | Cross-review in #internal |
| Recursive Contamination Control | Three-tier gate (Agent→Admin→Author) | Write requires review to prevent low-quality self-reinforcement |

## 触发词 | Triggers

**English**: research vault, memory vault, research-vault, dash vault, vault skill
**中文**: 研究 vault, 记忆库, 研究库, vault 技能, 记忆 vault

## 目录结构 | Directory Structure

```
vault/
├── 00-overview/          ← Vault index + key figures
├── 01-agents/            ← Agent role definitions
├── 02-channels/          ← Communication channel types
├── 03-internal-only/     ← Privacy-controlled content
├── 04-memory/            ← Three-tier memory with decay
│   ├── public/           ← All agents readable
│   ├── restricted/        ← Admin-only access
│   └── .meta/            ← Decay metadata
└── docs/                  ← Research documents
```

## 核心机制 | Core Mechanisms

### 衰退管理 | Decay Management

Based on Ebbinghaus forgetting curve, entries decay by difficulty:

| Difficulty | Retention Rate | Use Case |
|------------|----------------|----------|
| 4.0 | Very slow | Core client/industry facts |
| 2.0 | Medium | Technical knowledge |
| 0.5 | Fast | Dialogue extracts (unless cited) |

Decay formula: `retention = e^(-time / (difficulty * half_life))`

### 三层权限 | Three-Tier Access

- **public/**: All agents can read and write
- **restricted/**: Admin-only read, write via review gate
- **internal-only/**: No agent access, Researcher-only

## 使用示例 | Usage Examples

```bash
# Initialize a new vault
dash-research-vault init --name "My Research"

# Run weekly decay maintenance
dash-research-vault decay --tier public

# Scan and sync new findings
dash-research-vault loop --tier restricted
```

## 关键图表 | Key Figures

### Figure 1: Swarm Taxonomy
![Swarm Taxonomy](./00-overview/figures/fig1-swarm-taxonomy.png)

### Figure 2: Behavioral Heatmap
![Behavioral Heatmap](./00-overview/figures/fig2-behavioral-heatmap.png)

### Figure 3: Memory Causation Chain
![Memory Causation](./00-overview/figures/fig3-memory-causation.png)

### Figure 4: L2 Pressure Self-Evolution
![L2 Pressure](./00-overview/figures/fig4-l2-pressure-timeline.png)
