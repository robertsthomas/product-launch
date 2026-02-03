# Reusable Components Library

This directory contains a comprehensive library of reusable UI components that ensure consistency, reduce code duplication, and accelerate development across the application.

## Components Overview

### Buttons
- **Button**: Primary button component with variants (primary, secondary, danger, outline, ghost), sizes (sm, md, lg), and loading states
- **IconButton**: Specialized button for icon-only actions with variants
- **CloseButton**: Pre-built close button for modals and dialogs

```tsx
import { Button } from '@/components/common'

<Button variant="primary" size="md">
  Save Changes
</Button>

<Button variant="danger" isLoading={isLoading}>
  Delete
</Button>
```

### Cards
- **Card**: Base card container component
- **CardHeader**: Header section with background styling
- **CardBody**: Main content area
- **CardFooter**: Footer section with default flex layout for buttons

```tsx
import { Card, CardHeader, CardBody, CardFooter } from '@/components/common'

<Card>
  <CardHeader>Header Title</CardHeader>
  <CardBody>Main content</CardBody>
  <CardFooter>
    <Button>Cancel</Button>
    <Button variant="primary">Save</Button>
  </CardFooter>
</Card>
```

### Forms
- **Input**: Text input with label, error, and help text support
- **TextArea**: Multi-line text input
- **Select**: Dropdown select with options
- **FormGroup**: Container for grouping form elements

```tsx
import { Input, TextArea, Select, FormGroup } from '@/components/common'

<FormGroup layout="vertical" gap="var(--space-4)">
  <Input
    label="Product Name"
    placeholder="Enter name"
    error={errors.name}
  />
  <TextArea
    label="Description"
    helpText="Max 500 characters"
  />
  <Select
    label="Category"
    options={[
      { value: 'cat1', label: 'Category 1' },
      { value: 'cat2', label: 'Category 2' },
    ]}
  />
</FormGroup>
```

### State Components
- **Badge**: Status indicators with variants (primary, success, warning, danger, neutral)
- **EmptyState**: Display when no data available
- **ErrorState**: Error display with customizable messaging
- **LoadingSpinner**: Animated loading indicator
- **ProgressIndicator**: Linear progress bar

```tsx
import { Badge, EmptyState, LoadingSpinner } from '@/components/common'

<Badge variant="success">Active</Badge>

<EmptyState
  title="No products found"
  description="Get started by adding your first product"
  action={<Button>Add Product</Button>}
/>

<LoadingSpinner size="md" text="Loading..." />
```

### Modal & Dialog
- **BaseModal**: Reusable modal wrapper with consistent styling
- **ConfirmDialog**: Pre-built confirmation dialog for delete/confirm actions

```tsx
import { BaseModal, ConfirmDialog } from '@/components/common'

<ConfirmDialog
  isOpen={showConfirm}
  title="Delete Product?"
  message="This action cannot be undone"
  confirmText="Delete"
  isDangerous
  onConfirm={handleDelete}
  onClose={() => setShowConfirm(false)}
/>
```

### Collapsible & Tabs
- **Collapsible**: Single expandable section
- **Accordion**: Multiple collapsible sections (supports single or multi-open)
- **Tabs**: Tab navigation component with underline or pills variant

```tsx
import { Collapsible, Accordion, Tabs } from '@/components/common'

<Collapsible title="Advanced Options">
  <div>Additional settings</div>
</Collapsible>

<Tabs
  tabs={[
    { id: 'overview', label: 'Overview', content: <OverviewPanel /> },
    { id: 'details', label: 'Details', content: <DetailsPanel /> },
  ]}
  variant="underline"
/>
```

### Layout
- **Container**: Max-width centered wrapper
- **PageHeader**: Consistent page title with subtitle and action
- **Grid**: Multi-column layout system
- **Stack**: Flexible row/column layout with alignment options
- **Section**: Grouped content area with optional title

```tsx
import { Container, PageHeader, Grid, Stack, Section } from '@/components/common'

<Container>
  <PageHeader
    title="Products"
    subtitle="Manage your product catalog"
    action={<Button>Add Product</Button>}
  />

  <Grid columns={3} gap="var(--space-6)">
    {products.map(product => <ProductCard key={product.id} {...product} />)}
  </Grid>

  <Section title="Advanced Options" variant="subtle">
    <Stack gap="var(--space-4)">
      {/* content */}
    </Stack>
  </Section>
</Container>
```

### Icon Components
- **IconButton**: Icon-only button with hover states
- **CloseButton**: Pre-styled close button
- **ChevronIcon**: Rotatable chevron icon

```tsx
import { IconButton, CloseButton, ChevronIcon } from '@/components/common'

<IconButton icon={<TrashIcon />} size="md" />
<CloseButton onClick={handleClose} />
<ChevronIcon direction="down" />
```

## Usage Guidelines

### Consistency
- Always use components from this library instead of creating inline styles
- Use semantic HTML attributes (role, aria-label, etc.)
- Follow the existing color and spacing system (CSS variables)

### Props Patterns
Most components support these common props:
- `className`: For additional CSS class names
- `style`: For inline style overrides (use sparingly)
- `disabled`: For disabled states
- `variant`: For styling variants
- `size`: For size variants

### Theming
All components use CSS variables for colors and spacing:
- Colors: `var(--color-primary)`, `var(--color-surface)`, etc.
- Spacing: `var(--space-2)`, `var(--space-4)`, etc.
- Sizing: `var(--text-sm)`, `var(--radius-md)`, etc.

Modify `app/styles/theme.css` to update theme globally.

## Migration Path

To consolidate existing code:

1. **Identify duplicate patterns**: Look for repeated styling and logic
2. **Use existing components**: Replace inline styles with component equivalents
3. **Extract new components**: If a pattern isn't available, create it here
4. **Update files gradually**: Replace instances route-by-route or component-by-component

Example refactoring:
```tsx
// Before: Inline button styling
<button style={{
  padding: '10px 16px',
  background: '#fff',
  border: '1px solid #e4e4e7',
  borderRadius: '8px',
}}>
  Cancel
</button>

// After: Using Button component
<Button variant="secondary" size="md">
  Cancel
</Button>
```

## Performance Notes

- Components are lightweight and don't add unnecessary bundle size
- Use React.memo for components that receive frequently-changing props if performance is critical
- Avoid passing new object literals as props (use useMemo or move to constants)

## Accessibility

All components include:
- Proper semantic HTML tags
- ARIA labels where appropriate
- Keyboard navigation support
- Focus management
- Color contrast compliance

## Future Enhancements

Consider adding:
- DataTable component for large datasets
- Pagination component
- Tooltip component
- Dropdown menu component
- Breadcrumb navigation
- Toast notification system
- Drag-and-drop components
