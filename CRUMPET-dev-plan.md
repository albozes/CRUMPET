# CRUMPET — Dev Plan

**Controlled Runtime for Unified Media Prompt Engineering and Timing**

A single-page React application for composing precise, image-timed text prompts for AI video generation. Built with the `frontend-design` skill.

---

## 1. Overview

CRUMPET is a timeline-based prompt builder. Users drop in reference images, place timed markers on a timeline, write prompt fragments per marker, and the app assembles a final text prompt — ready to paste into an AI video generator.

**Output format (line-break separated):**

```
Prefix Prompt
at frame [N] [Marker 1 image ref] [Marker 1 Prompt]
at frame [N] [Marker 2 image ref] [Marker 2 Prompt]
Suffix Prompt
```

- Blank prefix/suffix/marker prompts are omitted entirely from output.
- Image references appear literally as the user-defined name (e.g. `@img1` or whatever they renamed it to).

---

## 2. Aesthetic Direction

**Industrial-utilitarian meets film production UI.** Think: Resolve or Nuke's node graph vibe but simplified. Dark background, monospaced labels, high-contrast orange accents for warnings and interactive elements. The UI should feel like a precision instrument — no decoration, every pixel functional.

- **Theme:** Dark mode only. Near-black background (`#111`), muted grays, white text, orange (`#E8730C`) for accents/warnings/active states.
- **Typography:** A distinctive monospaced or semi-mono font for labels and prompt text (e.g. JetBrains Mono or IBM Plex Mono). A clean sans-serif for UI chrome.
- **Motion:** Minimal — only functional transitions. Marker snapping, smooth sliding of text boxes, subtle hover states.
- **Layout:** Full viewport. Left panel = image dropzone + timeline. Right sidebar = final prompt output. Tabs along the top.

---

## 3. Layout Structure

```
┌──────────────────────────────────────────────────────────────┐
│  [Tab: SH010] [Tab: +]                                      │
├────────────────────────────────────────┬─────────────────────┤
│                                        │                     │
│  IMAGE DROPZONE AREA                   │  FINAL PROMPT       │
│  ┌──────┐ ┌──────┐ ┌──────┐           │                     │
│  │ img  │ │ img  │ │ img  │  ...       │  (auto-updating     │
│  │thumb │ │thumb │ │thumb │            │   read-only text    │
│  └──────┘ └──────┘ └──────┘            │   with copy button) │
│  @img1✏️   @img2✏️   @img3✏️             │                     │
│                                        │                     │
│  ┌──────────────────────────────────┐  │                     │
│  │ PREFIX textbox                   │  │                     │
│  ├──────────────────────────────────┤  │                     │
│  │                                  │  │                     │
│  │  TIMELINE  ▼ ▼    ▼        [⏱]  │  │                     │
│  │            markers              │  │                     │
│  │  [textbox] [textbox] [textbox]  │  │                     │
│  │                                  │  │                     │
│  ├──────────────────────────────────┤  │                     │
│  │ SUFFIX textbox                   │  │                     │
│  └──────────────────────────────────┘  │                     │
│                                        │                     │
└────────────────────────────────────────┴─────────────────────┘
```

---

## 4. Feature Spec

### 4.1 Image Dropzone

- Horizontal area at the top-left.
- Accepts drag-and-drop of standard image files (png, jpg, jpeg, webp, gif).
- Each image displays as a thumbnail with a label below: `@img1`, `@img2`, etc., auto-numbered in drop order.
- **Inline rename:** Hovering over a label shows a small pencil icon. Clicking it makes the label editable inline. The `@` prefix is part of the name and can be removed by the user.
- The image reference name (whatever the user sets) is used literally in the final prompt output.
- Prefills the image's reference name into the marker text box when assigned (see 4.3).

### 4.2 Timeline

- Horizontal bar representing the total duration.
- **Frame-based snapping:** All positions snap to exact frames. Snapping should feel tight and barely noticeable.
- Tick marks at every second, smaller ticks at key frame intervals.
- Displays frame numbers and/or second marks along the ruler.

#### Timeline Settings (clock icon button, top-right of timeline)

- Opens a small modal popup.
- **Duration:** Integer seconds input. Default: `8`. Recommended range: `4–15`.
  - Orange warning text below input if value is outside 4–15: _"Most AI video generating models do not support this length."_
- **Frame rate:** Dropdown with options: `24`, `25`, `30`, `60`. Default: `24`.
  - Orange warning text if not 24 or 25: _"Non-standard frame rate — most AI video models expect 24 or 25 fps."_

### 4.3 Markers

- **Placing:** Clicking anywhere on the timeline creates a new marker at that frame position.
- **Image assignment:** On creation, a small popup appears showing thumbnails of all dropped images. User clicks one to assign. Same image can be assigned to multiple markers.
- **Marker display:** A vertical pin/line on the timeline with the assigned image thumbnail.
- **Attached text box:** Below each marker, a collapsible text box. Prefilled with the assigned image's reference name (e.g. `@img1`). User types the prompt fragment here.
- **Draggable:** Markers can be dragged left/right along the timeline. Frame-snapping applies.
- **Text box stacking:** When markers are close together, text boxes automatically slide/offset vertically (alternating above/below or stacking) so all uncollapsed text boxes remain readable. No overlapping.
- **Collapsible:** Each text box can be collapsed to save space.
- **Delete:** Small trash bin icon at the bottom-right of the text box. Tooltip on hover: _"Delete marker"_.
- **Warning:** Orange warning text appears (below the timeline or in the settings area) if more than 10 markers are placed: _"More than 10 markers may not be supported by most AI video models."_

### 4.4 Prefix & Suffix

- **Prefix:** A text box pinned to the in-point (frame 0) of the timeline.
- **Suffix:** A text box pinned to the out-point (last frame) of the timeline.
- Both are always visible (not collapsible).
- If left blank, they are omitted from the final prompt entirely.

### 4.5 Final Prompt (Right Sidebar)

- Read-only text area that auto-updates on every change (any text input, marker move, image rename, timeline setting change).
- **Format (line-break separated):**

```
[Prefix Prompt]
at frame [N] [Marker 1 Prompt]
at frame [N] [Marker 2 Prompt]
...
[Suffix Prompt]
```

- Markers are ordered by frame position (ascending).
- Blank prompts (empty text box) are omitted entirely — no empty `at frame N` lines.
- Blank prefix/suffix omitted.
- **Copy button:** Always visible. Copies the full prompt to clipboard.

### 4.6 Tabs (Multi-Shot Sessions)

- Tab bar along the top of the app.
- Each tab is an independent workspace (own images, timeline, markers, prompt).
- Default first tab: `SH010`.
- **Renamable:** Double-click tab name to rename inline.
- **Add tab:** `+` button at the end of the tab bar.
- **Close tab:** Small `×` on each tab (confirm if content exists).

### 4.7 Persistence

- Save state to `localStorage` on every change.
- Persist: all tabs with their names, images (as data URIs or blob URLs), timeline settings, markers, all text content.
- On reload, restore the last session exactly.
- Only the most recent session is stored (no history/undo).

---

## 5. Tech Stack

- **React** (single `.jsx` file artifact)
- **Tailwind CSS** (core utility classes only — no compiler, pre-defined classes only)
- Fonts loaded from Google Fonts CDN
- No external state management — `useState` / `useReducer`
- `localStorage` for persistence (last session only)
- Drag-and-drop via native HTML5 drag/drop API

---

## 6. Interaction Details

| Action | Behavior |
|---|---|
| Drop image onto dropzone | Adds thumbnail + auto-labeled `@imgN` |
| Hover on image label | Pencil icon appears |
| Click pencil / label | Inline text edit, blur or Enter to confirm |
| Click clock icon | Opens timeline settings modal |
| Click on timeline | Creates marker → image picker popup appears |
| Select image in picker | Assigns image, prefills reference name in text box |
| Drag marker | Moves along timeline, snaps to frames |
| Click collapse toggle on text box | Collapses/expands the marker's text box |
| Click trash icon on text box | Deletes the marker (no confirmation needed) |
| Type in any text box | Final prompt updates in real time |
| Click copy button | Copies final prompt to clipboard |
| Double-click tab name | Inline rename |
| Click `+` tab | Creates new tab named `SH020`, `SH030`, etc. |
| Click `×` on tab | Closes tab (confirm if non-empty) |

---

## 7. Warnings Summary

All warnings are small orange text, appearing contextually:

| Condition | Warning Text | Location |
|---|---|---|
| Timeline duration < 4 or > 15 sec | "Most AI video generating models do not support this length." | Below duration input in settings modal |
| Frame rate not 24 or 25 | "Non-standard frame rate — most AI video models expect 24 or 25 fps." | Below fps dropdown in settings modal |
| More than 10 markers | "More than 10 markers may not be supported by most AI video models." | Below the timeline |

---

## 8. Edge Cases

- **No images dropped yet:** Clicking the timeline still creates a marker, but the image picker shows an empty state: _"Drop images above first."_
- **All markers deleted:** Final prompt shows only prefix/suffix (if non-empty), or is completely empty.
- **Marker at frame 0:** Treated separately from prefix — both can coexist.
- **Marker at last frame:** Treated separately from suffix — both can coexist.
- **Image deleted/removed:** If we support image removal, any markers referencing that image should show a warning state. (V1: images cannot be removed once dropped, to keep it simple.)
- **Tab limit:** No hard limit, but tabs scroll horizontally if many are open.
- **Very long prompts:** Right sidebar scrolls independently.

---

## 9. Build Notes for Claude Code

- Build as a **single React `.jsx` artifact file**.
- Use the **frontend-design skill** for all UI work. Read `/mnt/skills/public/frontend-design/SKILL.md` before starting.
- Dark industrial aesthetic: `#111` background, white/gray text, orange `#E8730C` accents.
- Use Google Fonts: `JetBrains Mono` for prompt text and labels, a clean sans like `DM Sans` for UI.
- All state in React hooks. Single `useReducer` recommended for the complex state tree.
- `localStorage` persistence: serialize full state on every change, restore on mount.
- No external dependencies beyond what's available in the React artifact environment (Tailwind, lucide-react for icons).
- Timeline rendering: use a `<canvas>` or pure HTML/CSS — whichever produces cleaner frame-snapping behavior.
- Text box stacking algorithm: when uncollapsed text boxes would overlap, alternate them above/below the timeline, or vertically offset them with small connector lines to their markers.
