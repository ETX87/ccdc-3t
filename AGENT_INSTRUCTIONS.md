# AI AGENT INSTRUCTIONS — CCDC 3T PROJECT

This document provides mandatory UI/UX design rules for ALL AI assistants (Claude, Cursor, Copilot, Windsurf, ChatGPT, etc.) working on this repository.

## 📌 CRITICAL RULE: PRESERVE THE 3T ASSET MANAGEMENT DESIGN SYSTEM
Before generating any frontend screen or component, you MUST inspect and strictly adhere to:
1. **`DESIGN_SYSTEM.md`** (Design token reference, layout grid, typography scale, component blueprints).
2. **`frontend/src/styles.css`** (Existing reusable class system).

## 🎨 COLOR & VISUAL IDENTITY
- **Sidebar**: Fixed width `261px`, Deep Teal Gradient: `linear-gradient(180deg, #0B6B7A 0%, #006573 45%, #005663 80%, #017280 100%)`.
- **Page Background**: Light cyan-tinted `#F7FBFE`. DO NOT use stark `#FFFFFF` or dark gray.
- **Cards**: Surface `#FFFFFF`, border `1px solid #F1F5F9`, subtle shadow `0 1px 3px rgba(0,0,0,0.025)`, radius `12px - 14px`.
- **Semantic Pastels for KPI & Badges**:
  - Mint/Cyan: `#E4FAFB` (Icon: `#009688`) - Total assets, Approved
  - Cyan: `#E1F7FB` (Icon: `#00BCD4`) - In warehouse, Inventory
  - Ocean Blue: `#E9F3FD` (Icon: `#2196F3`) - In use, Employees
  - Purple: `#F4EDFD` (Icon: `#7E57C2`) - Consumables, Allocation
  - Amber: `#FFF9E7` (Icon: `#FF9800`, text: `#D97706`) - Pending approval, Action needed
  - Danger: `#FEE2E2` (Icon: `#EF4444`, text: `#DC2626`) - Damaged, Overdue

## 📐 4-TIER PAGE ARCHITECTURE
Every module screen (Assets, Warehouses, Allocation, Transfers, Scrap, Audits) must follow this 4-tier structure:
1. **Sub-header**: Page title (`21px - 22px` bold `#0F172A`) + date/unit filters + action buttons.
2. **KPI Summary Row**: 3 to 5 summary metric cards (`.kpi-card` with round icon, watermark icon, big bold value `28px - 29px`).
3. **Main Workspace**: Clean flat data table (`.task-table`), pill-shaped sub-filter tabs (`.task-tab-btn`), blue link IDs (`.code-link` `#0284C7`), rounded status pills.
4. **Side / Secondary Panel**: Alert list or workflow diagram if applicable.

## 🛠️ REUSE EXISTING CSS CLASSES
Do NOT introduce external UI frameworks (like Bootstrap, AntD, Tailwind). Reuse existing classes from `frontend/src/styles.css`.
