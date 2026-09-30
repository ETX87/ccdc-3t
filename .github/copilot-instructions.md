# GitHub Copilot & Workspace AI Instructions — CCDC 3T

When building, modifying, or extending any frontend screens, forms, tables, or widgets in this workspace:

1. **Mandatory Design System Compliance**:
   - You MUST read and follow `DESIGN_SYSTEM.md`.
   - Never replace the signature 3T Asset Management design style with generic styling or external UI libraries.

2. **Colors & Themes**:
   - Main page background: `#F7FBFE`.
   - Sidebar: `261px` width, gradient `linear-gradient(180deg, #0B6B7A 0%, #006573 45%, #005663 80%, #017280 100%)`.
   - Cards: `#FFFFFF`, border `1px solid #F1F5F9`, border-radius `12px - 14px`.
   - 5 Pastel KPI groups: Mint (`#E4FAFB`), Cyan (`#E1F7FB`), Blue (`#E9F3FD`), Purple (`#F4EDFD`), Amber (`#FFF9E7`).

3. **Standard Screen Structure**:
   - Sub-header (title 21px bold + filters + action buttons).
   - KPI Summary Grid (3-5 cards).
   - Data Table Workspace (flat table, blue ID links `#0284C7`, pill status badges).

4. **CSS Reusability**:
   - Reuse classes in `frontend/src/styles.css` (.dashboard-container, .kpi-card, .content-card, .task-table, .status-badge, .task-filter-tabs).
