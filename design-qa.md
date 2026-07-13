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
