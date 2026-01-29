---
name: modernizeModals
description: Apply a modern, clean design system to modal and dialog components.
argument-hint: Reference design style or specific design tokens (e.g., "frosted glass", "soft shadows")
---
Update modal and dialog components to follow a modern, clean design aesthetic.

Apply these design principles:
1. **Backdrop**: Use frosted glass effect with white/light semi-transparent background (`rgba(255, 255, 255, 0.85)`) and `backdrop-filter: blur(12px)`
2. **Container**: Clean white background with large border radius (24px), subtle layered shadow
3. **Shadow**: Use soft, layered shadows (e.g., `0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)`)
4. **Layout**: Center content with proper padding (32px), centered icons/illustrations
5. **Typography**: Clear hierarchy with darker titles (#1e293b), muted subtitles (#64748b)
6. **Buttons**: Consistent border radius (12px), clean hover states, proper spacing
7. **Consistency**: Apply same treatment across all modals/dialogs in the codebase

Search for modal patterns (`position: "fixed"`, modal components) and update:
- Backdrop styling
- Container border radius and shadows
- Header/footer styling
- Button styling
- Internal card/item styling within modals

Remove harsh borders, gradients, and dark overlays in favor of clean, minimal aesthetics.
