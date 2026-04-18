<p align="center">
  <a href="https://evensong.zonicdesign.art">
    <img src="./00-overview/figures/social-card.png" alt="Dash Research Vault — persistent memory for AI agents" width="100%"/>
  </a>
</p>

<h1 align="center">Dash Research Vault</h1>

<p align="center">
  <em>The knowledge storage algorithms and multi-agent harness that let one model<br/>
  remember across sessions — <strong>and stop building the same thing twice.</strong></em>
</p>

<p align="center">
  <a href="./README.md">🇺🇸 English</a> · <a href="./README-zh.md">🇨🇳 中文</a>
</p>

<p align="center">
  <a href="https://github.com/Fearvox/dash-research-vault"><img src="https://img.shields.io/badge/Research_Vault-161A1D?style=for-the-badge&logo=github&logoColor=white" alt="Research Vault"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-EF2D56?style=for-the-badge&logo=creative-commons&logoColor=white" alt="License: CC BY-NC-ND"/></a>
  <a href="README-zh.md"><img src="https://img.shields.io/badge/Bilingual-FF6B35?style=for-the-badge&logo=translate&logoColor=white" alt="Bilingual: EN+ZH"/></a>
  <a href="https://evermind.ai"><img src="https://img.shields.io/badge/EverMind.ai-00D4AA?style=for-the-badge&logo=brain&logoColor=white" alt="EverMind"/></a>
</p>

<p align="center">
  <a href="https://evensong.zonicdesign.art/promo">▶ <strong>Watch the 2-minute film</strong></a>
  &nbsp;·&nbsp;
  <a href="https://evensong.zonicdesign.art">Live demo hub</a>
  &nbsp;·&nbsp;
  <a href="./docs/evensong-paper-en.pdf">Read the paper</a>
</p>

---

## What this is

A vault template for **multi-agent systems that need persistent memory**. It encodes three findings from the Evensong benchmark series:

| Finding | What it gives you | How it works |
|---|---|---|
| **Memory Causation** | A knowledge base that grows from real conversations, not curated docs | Dialogue extraction → Admin review → Write |
| **Pressure-Triggered Self-Evolution** | Agents that adapt their own strategy under load instead of breaking | L1 self-drive criteria + cross-review in `#internal` |
| **Recursive Contamination Control** | A guarantee that agents can't poison each other's memory | Three-tier write gate: Agent → Admin → Researcher |

The vault is the **substrate** that makes those findings reproducible. Drop it in next to any multi-agent stack and you have a memory that survives session boundaries.

---

## Directory structure

```
dash-research-vault/
├── 00-overview/         ← Vault index + 4 key figures
├── 01-agents/           ← 5 agent role definitions (Ops, Admin, Fin, Industry, Observer)
├── 02-channels/         ← 6 channel types (#internal, #ops, #admin, ...)
├── 03-internal-only/    ← Researcher-only strategy. No agent ever reads here.
├── 04-memory/           ← Three-tier memory + Ebbinghaus decay
│   ├── public/          ← All agents readable (client / dialogue / industry)
│   ├── restricted/      ← Admin-only (evolution / relationship / risk)
│   └── .meta/           ← Decay configuration
└── docs/                ← Research papers (EN + ZH)
```

---

## Vault tiers

| Tier | Read access | Write gate | Decay (default difficulty) |
|---|---|---|---|
| `public/` | All agents | Free | Fast — `0.5` (36h half-life) |
| `restricted/` | Admin only | Review required | Medium — `2.0` (144h half-life) |
| `internal-only/` | Researcher only | Direct | Slow — `4.0` (288h half-life) |

The tier you pick determines how fast a memory fades and who can write to it. The decay is per-document, not global — so one important client fact at `difficulty=4.0` outlives a thousand transient dialogue fragments at `0.5`.

---

## Decay algorithm

Based on the Ebbinghaus forgetting curve with **per-document difficulty weighting**:

```
retention(t) = e^(-t / (difficulty × half_life))
```

Default half-life: **72 hours**. Multiply by difficulty to get the effective half-life per document.

| Difficulty | Effective half-life | Use it for |
|---|---|---|
| `4.0` (core) | 288h ≈ 12 days | Client facts, industry positioning, hard-won lessons |
| `2.0` (technical) | 144h ≈ 6 days | Technical knowledge, runbook entries, system invariants |
| `0.5` (dialogue) | 36h | Conversation extracts, transient context, scratchpad |

When a document's `retention(t)` drops below the read threshold, it stops surfacing in agent context — but stays on disk. Restore it by accessing it (touches `last_accessed`, resets the curve).

---

## Key figures

All four figures are from the Evensong **R012-E** benchmark paper (`docs/`).

| Figure | Topic |
|---|---|
| ![Swarm Taxonomy](./00-overview/figures/fig1-swarm-taxonomy.png) | **Swarm taxonomy** — how the 5 agents cluster by behavior under L0/L1/L2 pressure |
| ![Behavioral Heatmap](./00-overview/figures/fig2-behavioral-heatmap.png) | **Behavioral heatmap** — per-task per-tier response signatures |
| ![Memory Causation](./00-overview/figures/fig3-memory-causation.png) | **Memory causation chain** — dialogue → strategy recall → architecture decision |
| ![L2 Pressure](./00-overview/figures/fig4-l2-pressure-timeline.png) | **L2 pressure timeline** — when self-evolution triggers fire and what they change |

---

## Research papers

| Paper | Language | File |
|---|---|---|
| When Agents Remember, They Stop Building | English | [evensong-paper-en.pdf](./docs/evensong-paper-en.pdf) |
| 当 Agent 记得，他们就停止重建 | 中文 | [evensong-paper-zh.pdf](./docs/evensong-paper-zh.pdf) |

> *Hengyuan Zhu (University of South Carolina). April 2026. arXiv preprint.*

### Citation (BibTeX)

```bibtex
@misc{zhu2026evensong,
  author       = {Hengyuan Zhu},
  title        = {When Agents Remember, They Stop Building: How Persistent Memory Alters AI Agent Engineering Strategy},
  year         = {2026},
  month        = {April},
  howpublished = {Preprint},
  institution  = {University of South Carolina},
  url          = {https://github.com/Fearvox/dash-research-vault}
}
```

---

## Setup

```bash
# Clone
git clone https://github.com/Fearvox/dash-research-vault.git
cd dash-research-vault

# Adapt to your team
#  1. Edit roles in        01-agents/
#  2. Rename channels in   02-channels/
#  3. Tune decay in        04-memory/.meta/decay-config.md
#  4. Replace example data with your own (use placeholders for sensitive items)
```

The vault is filesystem-native — no database, no daemon. Any agent that can read Markdown can read the vault. Add your own write-gate scripts on top.

---

## Live artifacts

| Resource | What it is |
|---|---|
| [evensong.zonicdesign.art](https://evensong.zonicdesign.art) | NAV portal — film + benchmarks + CLI showcase |
| [evensong.zonicdesign.art/promo](https://evensong.zonicdesign.art/promo) | 2-minute promotional film (1080p) |
| [DASH SHATTER](https://dash.zonicdesign.art) | Agent product site |
| [EverMind.ai](https://evermind.ai) | Memory & cognition research platform (related work) |

---

## License

Released under [**CC BY-NC-ND 4.0**](LICENSE). You may share unmodified copies with attribution for non-commercial use. For commercial licensing or research collaboration, open an issue.

---

<p align="center">
  <sub>
    <strong>Provenance</strong> — The vault template originates from the Evensong research project.<br/>
    Benchmark data referenced by ID (R011-B, R012-E) is for internal self-evolution reference only;<br/>
    do not redistribute the underlying datasets.
  </sub>
</p>

<p align="center">
  <a href="#dash-research-vault">↑ Back to top</a>
</p>
