# Dash Research Vault

> Multi-agent research vault with Evensong-style memory causation, Ebbinghaus decay, and L2 pressure self-evolution.

[![Research Vault](https://img.shields.io/badge/Research-Vault-blue?style=flat-square)](https://github.com/ProjectAlpha/dash-research-vault)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Language: Bilingual](https://img.shields.io/badge/Language-EN%2BZH-yellow?style=flat-square)](README-zh.md)

---

## Overview

A multi-agent research vault implementing **three Evensong core findings**:

| Finding | Application | Mechanism |
|---------|-------------|-----------|
| Memory Causation | Knowledge base accumulates over time | Dialogue extraction → Admin review → Write |
| Pressure-Triggered Self-Evolution | L1 self-drive criteria in each agent | Cross-review in #internal |
| Recursive Contamination Control | Three-tier gate (Agent→Admin→Researcher) | Write requires review |

## Directory Structure

```
dash-research-vault/
├── 00-overview/                 ← Vault index + 4 key figures
├── 01-agents/                   ← 5 agent role definitions
├── 02-channels/                 ← 6 channel types
├── 03-internal-only/            ← Privacy-controlled strategy
├── 04-memory/                   ← Three-tier memory + decay
│   ├── public/                  ← All agents readable
│   ├── restricted/               ← Admin-only
│   └── .meta/                   ← Decay metadata
└── docs/                        ← Research papers
```

## Key Figures

These figures are extracted from the Evensong R012-E benchmark paper.

### Figure 1: Swarm Taxonomy
![Swarm Taxonomy](./00-overview/figures/fig1-swarm-taxonomy.png)

### Figure 2: Behavioral Heatmap
![Behavioral Heatmap](./00-overview/figures/fig2-behavioral-heatmap.png)

### Figure 3: Memory Causation Chain
![Memory Causation](./00-overview/figures/fig3-memory-causation.png)

### Figure 4: L2 Pressure Self-Evolution
![L2 Pressure](./00-overview/figures/fig4-l2-pressure-timeline.png)

## Research Papers

| Paper | Language | File |
|-------|----------|------|
| Evensong R012-E Benchmark | English | [evensong-paper-en.pdf](./docs/evensong-paper-en.pdf) |
| Evensong R012-E Benchmark | Chinese | [evensong-paper-zh.pdf](./docs/evensong-paper-zh.pdf) |

## Vault Tiers

### 04-memory — Three-Tier Memory

| Tier | Access | Write | Decay |
|------|--------|-------|-------|
| `public/` | All agents | Free | Fast (difficulty=0.5) |
| `restricted/` | Admin only | Review gate | Medium (difficulty=2.0) |
| `internal-only/` | Researcher only | Direct | Slow (difficulty=4.0) |

### 03-internal-only — Strategy Layer

Contains sensitive strategy documents. No agent access — Researcher-only visibility.

## Decay Algorithm

Based on Ebbinghaus forgetting curve with **difficulty weighting**:

```
retention(t) = e^(-t / (difficulty × half_life))
```

Default half-life: **72 hours**

| Difficulty | Half-life | Example |
|------------|-----------|---------|
| 4.0 (core) | 288h | Client facts, industry data |
| 2.0 (tech) | 144h | Technical knowledge |
| 0.5 (dialogue) | 36h | Conversation extracts |

## Setup

```bash
# Clone this vault
git clone https://github.com/ProjectAlpha/dash-research-vault.git
cd dash-research-vault

# Adapt to your team
# Replace Agent roles in 01-agents/
# Set channel names in 02-channels/
# Configure decay in 04-memory/.meta/decay-config.md
```

## Language

- [English README](./README.md)
- [中文 README](./README-zh.md)

---

**Provenance**: This vault template was created as part of the Evensong research project. All benchmark data is for internal self-evolution reference only.
