# Dash Research Vault {#top}

> Multi-agent research vault with Evensong-style memory causation, Ebbinghaus decay, and L2 pressure self-evolution.

<!-- Language Toggle -->
<p align="center">
  <a href="#top">🇺🇸 English</a> · <a href="./README-zh.md">🇨🇳 中文</a>
</p>

---

<!-- Custom Badges -->
<p align="center">

[![Research Vault](https://img.shields.io/badge/Research_Vault-161A1D?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Fearvox/dash-research-vault)
[![License: CC BY-NC-ND](https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-EF2D56?style=for-the-badge&logo=creative-commons&logoColor=white)](LICENSE)
[![Bilingual: EN+ZH](https://img.shields.io/badge/Bilingual-FF6B35?style=for-the-badge&logo=translate&logoColor=white)](./README-zh.md)
[![EverMind](https://img.shields.io/badge/EverMind.ai-00D4AA?style=for-the-badge&logo=brain&logoColor=white)](https://evermind.ai)
[![Shields.io](https://img.shields.io/badge/Shields-000?style=for-the-badge&logo=starship&logoColor=white)](https://shields.io)

</p>

---

## Overview {#overview}

A multi-agent research vault implementing **three Evensong core findings**:

| Finding | Application | Mechanism |
|---------|-------------|--------|
| Memory Causation | Knowledge base accumulates over time | Dialogue extraction → Admin review → Write |
| Pressure-Triggered Self-Evolution | L1 self-drive criteria in each agent | Cross-review in #internal |
| Recursive Contamination Control | Three-tier gate (Agent→Admin→Researcher) | Write requires review |

[↑ Back to top](#top)

---

## Directory Structure {#structure}

```
dash-research-vault/
├── 00-overview/                 ← Vault index + 4 key figures
├── 01-agents/                   ← 5 agent role definitions
├── 02-channels/                 ← 6 channel types
├── 03-internal-only/            ← Privacy-controlled strategy
├── 04-memory/                   ← Three-tier memory + decay
│   ├── public/                  ← All agents readable
│   ├── restricted/              ← Admin-only
│   └── .meta/                   ← Decay metadata
└── docs/                        ← Research papers
```

[↑ Back to top](#top)

---

## Key Figures {#figures}

These figures are extracted from the **Evensong R012-E** benchmark paper.

### Figure 1: Swarm Taxonomy {#fig1}
![Swarm Taxonomy](./00-overview/figures/fig1-swarm-taxonomy.png)

### Figure 2: Behavioral Heatmap {#fig2}
![Behavioral Heatmap](./00-overview/figures/fig2-behavioral-heatmap.png)

### Figure 3: Memory Causation Chain {#fig3}
![Memory Causation](./00-overview/figures/fig3-memory-causation.png)

### Figure 4: L2 Pressure Self-Evolution {#fig4}
![L2 Pressure](./00-overview/figures/fig4-l2-pressure-timeline.png)

[↑ Back to top](#top)

---

## Research Papers {#papers}

| Paper | Language | File |
|-------|----------|------|
| Evensong R012-E Benchmark | English | [evensong-paper-en.pdf](./docs/evensong-paper-en.pdf) |
| Evensong R012-E Benchmark | Chinese | [evensong-paper-zh.pdf](./docs/evensong-paper-zh.pdf) |

[↑ Back to top](#top)

---

## Vault Tiers {#tiers}

### 04-memory — Three-Tier Memory {#memory-tiers}

| Tier | Access | Write | Decay |
|------|--------|-------|-------|
| `public/` | All agents | Free | Fast (difficulty=0.5) |
| `restricted/` | Admin only | Review gate | Medium (difficulty=2.0) |
| `internal-only/` | Researcher only | Direct | Slow (difficulty=4.0) |

### 03-internal-only — Strategy Layer {#strategy-layer}

Contains sensitive strategy documents. No agent access — Researcher-only visibility.

[↑ Back to top](#top)

---

## Decay Algorithm {#decay}

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

[↑ Back to top](#top)

---

## Setup {#setup}

```bash
# Clone this vault
git clone https://github.com/Fearvox/dash-research-vault.git
cd dash-research-vault

# Adapt to your team
# Replace Agent roles in 01-agents/
# Set channel names in 02-channels/
# Configure decay in 04-memory/.meta/decay-config.md
```

[↑ Back to top](#top)

---

## External Links {#links}

| Resource | Description |
|----------|-------------|
| [EverMind.ai](https://evermind.ai) | Memory & cognition research platform |
| [Evensong Benchmarks](https://bench.zonicdesign.art/evensong) | Interactive benchmark visualization |
| [DASH SHATTER](https://dash-shatter.vercel.app) | Agent product site |

---

## Language

- [🇺🇸 English README](./README.md)
- [🇨🇳 中文 README](./README-zh.md)

---

**Provenance**: This vault template was created as part of the Evensong research project. All benchmark data is for internal self-evolution reference only.
