# Component Consolidation & Refactoring Guide

## Overview
This guide outlines how to migrate existing code to use the new reusable components library, reducing code duplication and improving consistency.

## Component Migration Map

### Buttons (→ use `Button` component)
**Files to update:**
- `app/routes/app.standards.tsx` - Create/Cancel buttons, form actions
- `app/routes/app.plans.tsx` - Navigation and plan buttons
- `app/routes/app._index.tsx` - Dashboard action buttons
- `app/routes/app.monitoring.tsx` - Monitor action buttons
- `app/components/product/ProductChecklistCard.tsx` - Save/Cancel buttons
- `app/routes/app.settings.tsx` - Various action buttons

**Pattern to replace:**
```tsx
// ❌ Before: Inline button styling (50+ instances)
<button
  type="button"
  onClick={handleClick}
  disabled={isDisabled}
  style={{
    padding: "10px 16px",
    background: isDisabled ? "#f5f5f5" : "#1f4fd8",
    color: isDisabled ? "#999" : "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: isDisabled ? "not-allowed" : "pointer",
  }}
>
  Click me
</button>

// ✅ After: Using Button component
import { Button } from '@/components/common'

<Button 
  variant="primary" 
  size="md"
  disabled={isDisabled}
  onClick={handleClick}
>
  Click me
</Button>
```

### Cards (→ use `Card`, `CardHeader`, `CardBody`, `CardFooter`)
**Files to update:**
- `app/routes/app._index.tsx` - Dashboard cards
- `app/routes/app.monitoring.tsx` - Monitoring cards
- `app/components/product/ProductChecklistCard.tsx` - Checklist card

**Pattern to replace:**
```tsx
// ❌ Before: Inline card styling
<div style={{
  border: "1px solid #e4e4e7",
  borderRadius: "12px",
  background: "#fff",
  padding: "24px",
}}>
  Content
</div>

// ✅ After: Using Card component
import { Card, CardHeader, CardBody } from '@/components/common'

<Card>
  <CardHeader>Title</CardHeader>
  <CardBody>Content</CardBody>
</Card>
```

### Form Inputs (→ use `Input`, `TextArea`, `Select`, `FormGroup`)
**Files to update:**
- `app/routes/app.standards.tsx` - Rule creation form
- `app/routes/app.monitoring.tsx` - Configuration forms
- `app/components/product/ProductChecklistCard.tsx` - Product edit forms

**Pattern to replace:**
```tsx
// ❌ Before: Inline input styling
<input
  type="text"
  value={value}
  onChange={(e) => setValue(e.target.value)}
  style={{
    padding: "10px 12px",
    border: "1px solid #e4e4e7",
    borderRadius: "8px",
    fontSize: "14px",
  }}
/>

// ✅ After: Using Input component
import { Input } from '@/components/common'

<Input
  label="Product Name"
  value={value}
  onChange={(e) => setValue(e.target.value)}
  placeholder="Enter name"
/>
```

### Modals (→ use `BaseModal` or `ConfirmDialog`)
**Files to update:**
- `app/routes/app.products.$id.tsx` - Image generation, Generate All modals
- `app/routes/app.settings.tsx` - Product history modal
- `app/routes/app._index.tsx` - Celebration modal, monitoring modal

**Pattern to replace:**
```tsx
// ❌ Before: Inline modal styling
{showModal && (
  <div style={{
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
  }}>
    {/* content */}
  </div>
)}

// ✅ After: Using BaseModal component
import { BaseModal } from '@/components/common'

<BaseModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  title="Modal Title"
>
  {/* content */}
</BaseModal>
```

### Collapsible Sections (→ use `Collapsible` or `Accordion`)
**Files to update:**
- `app/routes/app.settings.tsx` - Expandable sections
- `app/routes/app.monitoring.tsx` - Collapsible panels

**Pattern to replace:**
```tsx
// ❌ Before: Manual expand/collapse logic
const [isOpen, setIsOpen] = useState(false)
return (
  <div>
    <button onClick={() => setIsOpen(!isOpen)}>Toggle</button>
    {isOpen && <div>Content</div>}
  </div>
)

// ✅ After: Using Collapsible component
import { Collapsible } from '@/components/common'

<Collapsible title="Advanced Settings">
  Content
</Collapsible>
```

### Tabs (→ use `Tabs`)
**Files to update:**
- `app/routes/app.products.$id.tsx` - Product tabs
- `app/routes/app.monitoring.tsx` - Monitoring tabs

**Pattern to replace:**
```tsx
// ❌ Before: Manual tab logic
const [activeTab, setActiveTab] = useState('overview')

// ✅ After: Using Tabs component
import { Tabs } from '@/components/common'

<Tabs
  tabs={[
    { id: 'overview', label: 'Overview', content: <Overview /> },
    { id: 'details', label: 'Details', content: <Details /> },
  ]}
/>
```

### Layout (→ use `Container`, `Grid`, `Stack`, `Section`)
**Files to update:**
- `app/routes/app._index.tsx` - Page layouts
- `app/routes/app.plans.tsx` - Plan cards layout
- `app/routes/app.monitoring.tsx` - Dashboard layout

**Pattern to replace:**
```tsx
// ❌ Before: Inline layout styling
<div style={{ maxWidth: "1200px", margin: "0 auto" }}>
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}>
    {/* items */}
  </div>
</div>

// ✅ After: Using layout components
import { Container, Grid } from '@/components/common'

<Container>
  <Grid columns={3}>
    {/* items */}
  </Grid>
</Container>
```

## Refactoring Priority

### Phase 1 (High Impact, Low Risk)
1. ✅ Create all reusable components (DONE)
2. Migrate Button usage in:
   - `app/routes/app.standards.tsx` (~10 buttons)
   - `app/routes/app.plans.tsx` (~8 buttons)
   - `app/components/product/ProductChecklistCard.tsx` (~5 buttons)

### Phase 2 (Medium Impact)
3. Migrate Card components in dashboard
4. Migrate Form inputs in standards/monitoring
5. Replace inline modals with BaseModal

### Phase 3 (Optimization)
6. Migrate Layout styling (Grid, Stack, Container)
7. Replace tab implementations
8. Consolidate collapsible sections

## Step-by-Step Refactoring Template

### 1. **Identify instances**
```bash
# Search for patterns
grep -r "padding.*border.*rounded" app/routes/*.tsx
grep -r "onClick.*style=" app/routes/*.tsx
```

### 2. **Import components**
```tsx
import { Button, Card, Input, BaseModal } from '@/components/common'
```

### 3. **Replace inline styles**
```tsx
// Remove style={{ ... }} prop
// Use component props instead
<Button variant="primary" size="md" disabled={isDisabled}>
  Action
</Button>
```

### 4. **Test thoroughly**
- Visual: Compare before/after styling
- Functional: Test all interactions
- Responsive: Check mobile/tablet views

### 5. **Lint and format**
```bash
pnpm run format
pnpm run lint:fix
pnpm run typecheck
```

## Common Challenges & Solutions

### Challenge 1: Custom styling override
**Problem**: Component doesn't support needed style variant
**Solution**: 
```tsx
// Use style prop for overrides (rarely needed)
<Button variant="primary" style={{ borderRadius: '20px' }}>
  Button
</Button>

// Or extend the component
// Create a new variant in the component if used multiple times
```

### Challenge 2: Props combination
**Problem**: Not sure which props to use
**Solution**: Check component documentation in `README.md`
```tsx
// Good: Semantic prop combinations
<Button variant="danger" isLoading={isDeleting}>Delete</Button>

// Avoid: Conflicting overrides
<Button variant="primary" style={{ background: 'red' }}>
```

### Challenge 3: Performance impact
**Problem**: Concerned about re-renders
**Solution**: Most components are lightweight, but for highly dynamic:
```tsx
// Use useMemo for props
const buttonProps = useMemo(() => ({
  variant: status === 'active' ? 'primary' : 'secondary'
}), [status])

<Button {...buttonProps}>Action</Button>
```

## Verification Checklist

After migration:
- [ ] All tests pass
- [ ] No TypeScript errors: `pnpm run typecheck`
- [ ] Code formatted: `pnpm run format`
- [ ] Linting passes: `pnpm run lint`
- [ ] Visual regression testing done
- [ ] Accessibility features work
- [ ] Responsive design tested
- [ ] Performance acceptable

## Files Created

```
app/components/common/
├── Button.tsx              # Button component with variants
├── Card.tsx                # Card components
├── Form.tsx                # Form inputs (Input, TextArea, Select, FormGroup)
├── IconButton.tsx          # Icon buttons and utilities
├── State.tsx               # Badge, EmptyState, ErrorState, LoadingSpinner
├── BaseModal.tsx           # (Existing) Modal component
├── Collapsible.tsx         # Collapsible and Accordion
├── ConfirmDialog.tsx       # Confirmation dialog
├── Tabs.tsx                # Tabs component
├── Layout.tsx              # Layout components (Container, Grid, Stack, Section)
├── index.ts                # Export all components
└── README.md               # Component documentation
```

## Next Steps

1. Start with Phase 1 refactoring
2. Track progress in todo list
3. Update components as needed based on feedback
4. Add new components as patterns emerge
5. Consider extracting more specific components (DataTable, Dropdown, etc.)

## Support

- Check component props in `README.md`
- Look at component source for details
- Refer to existing usages for examples
- Test with different states and sizes
