# External App Jump — Design QA

- Source visual truth: `/Users/hadancy/Desktop/AI预测软件/AI-Prediction/tmp/external-app-qa/reference.png`
- Implementation screenshot: `/Users/hadancy/Desktop/AI预测软件/AI-Prediction/tmp/external-app-qa/dashboard.jpeg`
- Settings screenshot: `/Users/hadancy/Desktop/AI预测软件/AI-Prediction/tmp/external-app-qa/settings.jpeg`
- Focused comparison: `/Users/hadancy/Desktop/AI预测软件/AI-Prediction/tmp/external-app-qa/comparison.png`
- Viewport: 1332 × 768 desktop Electron window
- State: dashboard with no external software configured; Settings with empty configuration

## Full-view comparison evidence

The Electron dashboard was opened at the desktop viewport and compared with the supplied top-bar reference. The new external-software control sits immediately to the left of “返回后台” without shifting the title console or overlapping the dashboard content. The existing top-bar composition remains intact.

## Focused region comparison evidence

The focused side-by-side comparison shows that both controls use the existing button's cyan outline, dark translucent fill, corner radius, icon scale, text weight, height, and spacing. The new control reads as a sibling action rather than a new visual system. The source crop and app capture use different display scales, so pixel dimensions are not compared directly; proportions and styling are consistent at the rendered viewport.

## Findings

No actionable P0, P1, or P2 visual differences were found.

- Fonts and typography: the existing Microsoft YaHei/Segoe UI fallback stack, weight, line height, and legibility are preserved.
- Spacing and layout rhythm: the new control uses the same height and padding as “返回后台”; the right-side group gap remains even and no controls overflow.
- Colors and visual tokens: border, foreground, hover treatment, translucent background, and glow reuse the existing dashboard button styles.
- Image and icon fidelity: the existing Element Plus icon library supplies the monitor and back icons; no placeholder or custom-drawn asset was introduced.
- Copy and content: “打开软件” is concise in the unconfigured state, the selected software name replaces it after configuration, and Settings explains the Windows file types supported.

## Interaction checks

- “返回后台” navigates from the dashboard to the admin area.
- The Settings menu opens the external-software configuration card.
- “选择软件” opens the native operating-system file picker and cancel returns safely without changing settings.
- Empty-state test and save controls are disabled.
- The unconfigured dashboard button has an accessible name and Settings guidance.
- Production build, node/web type checks, and targeted lint checks pass.

## Comparison history

Initial comparison found no P0/P1/P2 mismatch, so no visual fix iteration was required.

## Follow-up polish

No blocking polish remains. Windows launch behavior should still receive a final smoke test on a Windows machine with representative `.exe` and `.lnk` targets.

final result: passed

---

# AI Energy Net Forecast — Design QA

- Source visual truth: `/Users/hadancy/Desktop/AI预测软件/AI-Prediction/outputs/ai-energy-net-forecast-compact-concept.png`
- Implementation screenshot: `/Users/hadancy/Desktop/AI预测软件/AI-Prediction/outputs/energy-dashboard-generation-green.png`
- Focused implementation crop: `/Users/hadancy/Desktop/AI预测软件/AI-Prediction/outputs/energy-panel-generation-green.png`
- Full side-by-side comparison: `/Users/hadancy/Desktop/AI预测软件/AI-Prediction/outputs/energy-panel-design-comparison-green.png`
- Net tooltip interaction screenshot: `/Users/hadancy/Desktop/AI预测软件/AI-Prediction/outputs/energy-dashboard-net-tooltip.png`
- Viewport: 1332 × 768 desktop Electron window; rendered energy-panel crop approximately 356 × 472
- State: 2026-04-03 dashboard forecast; PLC unavailable, so live load input resolves to `0.000 kWh`

## Full-view comparison evidence

The compact mock and rendered Electron panel were normalized to the same comparison height and reviewed side by side. The implementation preserves the target's two-chart hierarchy: a shared generation/load comparison above a signed net-energy chart, followed by the existing KPI region. The complete panel remains inside the pre-existing fixed dashboard height with no clipped chart, hidden KPI, or vertical overflow.

The live panel is narrower than the concept canvas, so the existing container-query behavior intentionally changes the KPI region from the mock's three-column first row to a two-column responsive grid with a full-width maintenance card. This is consistent with the product's established responsive system and protects chart readability.

## Focused region comparison evidence

The focused panel crop confirms that chart titles, legends, axis labels, line weights, zero baseline, formula chip, KPI hierarchy, borders, and corner radii remain readable at the rendered width. A separate interaction capture confirms the net-energy tooltip lists generation, usage, and signed net energy together.

## Findings

No actionable P0, P1, or P2 visual differences remain.

- Fonts and typography: the existing dashboard font stack and heading weights are preserved. Chart labels remain legible at the narrow container breakpoint without wrapping or clipping.
- Spacing and layout rhythm: the module keeps the original two chart rows and KPI row allocation. The formula and compact legends fit on the net-chart title row, and all five KPI cards remain visible.
- Colors and visual tokens: user-approved bright green generation, sky-blue usage, mint surplus, and orange deficit create clearer series separation while preserving the dashboard's dark cyan visual language. Borders, backgrounds, and glows use existing panel treatments.
- Image quality and asset fidelity: the implementation uses ECharts canvas rendering and the existing Element Plus icon library. No placeholder imagery or replacement icon assets were introduced. The OS-level QA capture is softer than the native canvas, but the rendered application itself remains crisp.
- Copy and content: `24小时发 / 用电量预测（kWh）`, `24小时净电量预测（kWh）`, `发电量 − 用电量`, `盈余`, and `缺口` match the selected design. Tooltips show three-decimal kWh values and a plus sign for positive net energy.

## Interaction and runtime checks

- The upper chart tooltip displays the aligned hourly generation and usage predictions.
- The net chart tooltip displays generation, usage, and net energy together; the checked sample shows `8.195 − 0.000 = +8.195 kWh`.
- Hourly data is aligned by its time label before subtraction.
- The net chart supports positive and negative axis values, includes a dashed zero baseline, and changes from mint to orange across zero.
- Renderer and Node type checks pass; targeted ESLint, Prettier, and `git diff --check` pass.
- No renderer exception appeared during the visual test. PLC and camera connection errors were expected because the external devices were unavailable and are unrelated to this change.

## Comparison history

1. Initial rendered comparison: the compact layout fit, but the `发电量 − 用电量` formula chip was hidden at the active narrow-container breakpoint.
2. Fix: moved the formula-chip hiding threshold from 460 px to 270 px so it remains visible in the current panel while still protecting extremely narrow layouts.
3. Post-fix evidence: `/Users/hadancy/Desktop/AI预测软件/AI-Prediction/outputs/energy-panel-design-comparison-final.png` shows the formula, legends, both charts, and KPI grid fitting without overlap.
4. Color refinement: generation changed from cyan to bright green at the user's request; `/Users/hadancy/Desktop/AI预测软件/AI-Prediction/outputs/energy-panel-design-comparison-green.png` confirms stronger green-blue separation without layout drift.

## Follow-up polish

- P3: the explanatory surplus/deficit text bars from the concept are omitted in the live narrow panel to preserve chart and KPI height. The formula chip, color legend, zero line, and tooltip retain the same meaning without consuming another row.

final result: passed
