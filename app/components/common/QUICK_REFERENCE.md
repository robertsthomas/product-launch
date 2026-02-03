# 📚 Quick Reference - Reusable Components

## Import All Components
```tsx
import {
  // Buttons
  Button,
  IconButton,
  CloseButton,
  ChevronIcon,
  
  // Cards
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  
  // Forms
  Input,
  TextArea,
  Select,
  FormGroup,
  
  // States
  Badge,
  EmptyState,
  ErrorState,
  LoadingSpinner,
  ProgressIndicator,
  
  // Modals & Dialogs
  BaseModal,
  ConfirmDialog,
  
  // Collapsible
  Collapsible,
  Accordion,
  
  // Tabs
  Tabs,
  
  // Layout
  Container,
  PageHeader,
  Grid,
  Stack,
  Section,
} from '@/components/common'
```

## Common Patterns

### Button States
```tsx
// Primary
<Button variant="primary">Save</Button>

// Secondary (outline)
<Button variant="secondary">Cancel</Button>

// Danger (red)
<Button variant="danger">Delete</Button>

// Loading
<Button isLoading>Processing...</Button>

// Disabled
<Button disabled>Disabled</Button>

// Full width
<Button fullWidth>Full Width Button</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="md">Medium (default)</Button>
<Button size="lg">Large</Button>

// With icon
<Button icon={<TrashIcon />}>Delete</Button>
```

### Form Setup
```tsx
<FormGroup layout="vertical" gap="var(--space-4)">
  <Input
    label="Full Name"
    placeholder="John Doe"
    error={errors.name}
  />
  
  <TextArea
    label="Description"
    rows={4}
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

### Cards
```tsx
<Card>
  <CardHeader>
    <h3>Product Details</h3>
  </CardHeader>
  
  <CardBody>
    <p>Main content goes here</p>
  </CardBody>
  
  <CardFooter>
    <Button variant="secondary">Cancel</Button>
    <Button variant="primary">Save</Button>
  </CardFooter>
</Card>
```

### Modals
```tsx
// Confirm/Delete
<ConfirmDialog
  isOpen={showDelete}
  title="Delete Product?"
  message="This cannot be undone"
  confirmText="Delete"
  isDangerous
  onConfirm={handleDelete}
  onClose={() => setShowDelete(false)}
/>

// Custom Modal
<BaseModal
  isOpen={isOpen}
  title="Settings"
  onClose={() => setIsOpen(false)}
  footer={
    <>
      <Button variant="secondary" onClick={() => setIsOpen(false)}>
        Close
      </Button>
      <Button variant="primary">Save</Button>
    </>
  }
>
  {/* content */}
</BaseModal>
```

### Collapsible Sections
```tsx
// Single
<Collapsible title="Advanced Options">
  Hidden content here
</Collapsible>

// Multiple (Accordion)
<Accordion
  items={[
    { id: 'opt1', title: 'Option 1', content: <Content1 /> },
    { id: 'opt2', title: 'Option 2', content: <Content2 /> },
  ]}
  allowMultiple
/>
```

### Tabs
```tsx
<Tabs
  tabs={[
    { id: 'overview', label: 'Overview', content: <Overview /> },
    { id: 'details', label: 'Details', content: <Details /> },
  ]}
  variant="underline"
/>
```

### Layout
```tsx
<Container>
  <PageHeader
    title="Dashboard"
    subtitle="Welcome back!"
    action={<Button>New Product</Button>}
  />
  
  <Grid columns={3} gap="var(--space-6)">
    {products.map(p => <ProductCard key={p.id} {...p} />)}
  </Grid>
  
  <Section title="Settings" variant="subtle">
    <Stack direction="row" gap="var(--space-4)">
      {/* items */}
    </Stack>
  </Section>
</Container>
```

### States
```tsx
// Badge
<Badge variant="success">Active</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="danger">Failed</Badge>

// Loading
<LoadingSpinner size="md" text="Loading..." />

// Empty
<EmptyState
  title="No products"
  description="Create your first product"
  action={<Button>Create</Button>}
/>

// Error
<ErrorState
  message="Failed to load products"
  action={<Button>Retry</Button>}
/>

// Progress
<ProgressIndicator current={3} total={10} />
```

## Size Reference

### Button Sizes
| Size | Padding | Font |
|------|---------|------|
| sm   | 8px 12px | --text-xs |
| md   | 10px 16px | --text-sm |
| lg   | 12px 24px | --text-base |

### Icon Sizes
| Size | Dimension |
|------|-----------|
| sm   | 28px |
| md   | 36px |
| lg   | 44px |

### Text Sizes (CSS Variables)
| Var | Size |
|-----|------|
| --text-xs | 12px |
| --text-sm | 14px |
| --text-base | 16px |
| --text-lg | 18px |
| --text-2xl | 24px |

### Spacing (CSS Variables)
| Var | Size |
|-----|------|
| --space-2 | 8px |
| --space-3 | 12px |
| --space-4 | 16px |
| --space-6 | 24px |
| --space-8 | 32px |

## Color Variants

### Button Variants
- `primary` - Main action button
- `secondary` - Alternative action
- `danger` - Destructive action
- `outline` - Secondary with border
- `ghost` - Transparent, text only

### Badge Variants
- `primary` - Default/info
- `success` - Success state
- `warning` - Warning state
- `danger` - Error/danger
- `neutral` - Muted/inactive

### Section Variants
- `default` - Normal white card
- `subtle` - Light gray background
- `highlight` - Accent color background

## Accessibility Features

### Built-in
- ✅ Semantic HTML (button, input, select)
- ✅ ARIA labels on icon buttons
- ✅ Role attributes (dialog, tab, etc.)
- ✅ Keyboard navigation support
- ✅ Focus management
- ✅ Color contrast compliance

### Usage Tips
```tsx
// Always use aria-label for icon-only buttons
<IconButton icon={<DeleteIcon />} ariaLabel="Delete product" />

// Use proper semantic elements
<Section title="Settings">
  {/* Renders as <section> */}
</Section>

// Form validation
<Input
  label="Email"
  type="email"
  error={errors.email}
/>
```

## TypeScript Types

```tsx
// Button
interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'variant'> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  fullWidth?: boolean
  icon?: React.ReactNode
}

// Input
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helpText?: string
  fullWidth?: boolean
}

// Grid
interface GridProps {
  children: React.ReactNode
  columns?: number
  gap?: string
  className?: string
  style?: React.CSSProperties
}
```

## Common Mistakes to Avoid

❌ Don't mix inline styles with component props
```tsx
<Button variant="primary" style={{ background: 'red' }}>
  Wrong
</Button>
```

✅ Use component variants instead
```tsx
<Button variant="danger">
  Correct
</Button>
```

---

❌ Don't forget fullWidth for form buttons
```tsx
<Button>Single Width</Button>
```

✅ Use fullWidth or Stack with space-between
```tsx
<Stack direction="row" justify="between">
  <Button variant="secondary">Cancel</Button>
  <Button>Save</Button>
</Stack>
```

---

❌ Don't pass event handlers as new functions
```tsx
<Button onClick={() => doSomething()}>Click</Button>
```

✅ Use useCallback if needed
```tsx
const handleClick = useCallback(() => doSomething(), [])
<Button onClick={handleClick}>Click</Button>
```

## Pro Tips

1. **Use FormGroup for layout** - Handles spacing and alignment
2. **Prefer Grid over manual divs** - Responsive and consistent
3. **Use Badge for status** - Better than custom styling
4. **Leverage Stack** - Simpler than flexbox classes
5. **Use variant over style** - Maintains consistency
6. **Icon buttons need aria-label** - For accessibility

## Resources

- 📖 [Full Documentation](./README.md)
- 🔄 [Consolidation Guide](../COMPONENT_CONSOLIDATION.md)
- 📝 [Summary](../REUSABLE_COMPONENTS_SUMMARY.md)
