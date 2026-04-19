# Design System — AI Farmer-Polygon Matcher

## Product Context
- **What this is:** A data tool for automated land parcel matching and carbon credit registration
- **Who it's for:** Green Carbon field coordinators and J-Credit registrars
- **Space/industry:** Agricultural tech / carbon credit / GIS / environmental
- **Project type:** Dashboard web app (Streamlit)

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian + Organic Warmth ("the field report")
- **Decoration level:** Minimal — typography and color do all the work
- **Mood:** Precision data tool that feels like it was made by people who spend time outdoors. Methodical, legible, trustworthy. Feels like a certified field document, not a generic SaaS dashboard.
- **Reference sites:** regrow.ag (dark forest green + editorial), green-carbon.co.jp (brand color reference)

## Typography
- **Display/Hero:** DM Sans 500 — used for app title and section headers
- **Body:** DM Sans 400 — all body copy, labels, descriptions
- **UI/Labels:** DM Sans 500 — button text, nav items, form labels
- **Data/Tables:** DM Sans 400 with `font-variant-numeric: tabular-nums` — all numeric values, confidence scores, area measurements
- **Code:** Not used in this product
- **Loading:** Google Fonts CDN — `DM Sans` (wght 300..600)
- **Scale:**
  - xs: 10px / letter-spacing 0.08em / uppercase (section labels, column headers)
  - sm: 12px (secondary text, sub-labels, timestamps)
  - base: 13px (body, table rows, form inputs)
  - md: 14px (primary body, nav items)
  - lg: 18px (audit panel farmer ID)
  - xl: 28px (confidence card numbers)
  - 2xl: 36px (display headings)

## Color
- **Approach:** Restrained — green primary, white surface, color reserved for confidence indicators and semantic states
- **Primary:** #1B4332 — forest green, used for header/nav background and primary CTA buttons
- **Surface:** #FFFFFF — white page background
- **Card background:** #FFFFFF — elevated above surface with subtle border
- **Surface alt:** #F9F9F9 — sidebar, table header rows, subtle section backgrounds
- **Text:** #1A1A1A — near-black for all primary text
- **Muted:** #6B7C76 — sage gray for secondary labels, placeholder text, timestamps
- **Border:** #E5E5E5 — all dividers, card borders, input borders
- **Confidence — High (≥80%):**
  - Foreground: #2D6A4F
  - Background: #F0FAF3
  - Border: #D8F3DC
- **Confidence — Mid (60–79%):**
  - Foreground: #A05020
  - Background: #FFFBF5
  - Border: #FDEBD0
- **Confidence — Low (<60%):**
  - Foreground: #C1121F
  - Background: #FFF8F8
  - Border: #FDDADA
- **Map polygon colors:** #40916C (high) / #F4A261 (mid) / #C1121F (low) — these are intentionally distinct from the UI badge colors to avoid confusion between map and panel
- **Dark mode:** Invert surfaces (--white → #1C1C1E, --surface → #141416), reduce color saturation by 15%, maintain green primary

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable (not cramped, not airy)
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)
- **Component padding:** Cards: 16px inner · Table cells: 10px vertical, 16px horizontal · Sidebar items: 7px vertical, 8px horizontal

## Layout
- **Approach:** Grid-disciplined
- **Primary layout:** Fixed left sidebar (180px) + main content area (flex)
- **Confidence strip:** Always the dominant first-viewport element — placed above the map. This is the key design risk: the audit/confidence story leads, the map follows.
- **Map area:** 60% of main content width (min-height 320px)
- **Audit panel:** Fixed 240px right column, visible when a polygon is selected
- **Max content width:** 1200px
- **Border radius:**
  - Inputs, buttons: 4px
  - Cards, panels: 8px
  - Full pill (badges): 9999px
  - App frame: 12px

## Icons
- **Library:** Phosphor Icons (lightweight, clean, consistent stroke weight)
- **CDN:** `https://unpkg.com/phosphor-icons@1.4.2/src/css/icons.css` or inline SVG
- **Usage:** Use icons for navigation, actions, and status indicators. Reserve emoji for the app favicon (🌾) and zero-state illustrations only. Do NOT use emoji as icon substitutes in data tables, badges, or navigation.
- **Confidence indicators in code:**
  - High: green filled circle icon (or CSS dot #40916C)
  - Mid: orange filled circle icon (or CSS dot #F4A261)
  - Low: red filled circle icon (or CSS dot #C1121F)

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Easing:** enter(ease-out) exit(ease-in)
- **Duration:** micro(50-100ms) · short(150-250ms)
- **Allowed:** Folium map tile loads · Streamlit spinner · Success/error alert fade-in
- **Not allowed:** Decorative animations, loading skeletons, entrance animations

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-19 | DM Sans throughout (no display serif) | Readability at data density; consistent with field-report aesthetic; no serif/sans mismatch at small sizes |
| 2026-04-19 | White (#FFFFFF) surface over cream | User preference; cream dropped in favor of simplicity |
| 2026-04-19 | Confidence strip as hero element (Risk 3) | Core product value prop is auditability; metrics-first layout reinforces this to judges and users |
| 2026-04-19 | Forest green #1B4332 primary | Category baseline; Green Carbon brand anchor; environmental credibility signal |
| 2026-04-19 | 4px border-radius on inputs/buttons | Serious, not playful; matches "certified document" aesthetic |
| 2026-04-19 | Icons library over emoji | Emoji are inconsistent across platforms and operating systems; icon library gives consistent stroke, size, and color control |
