// Stable keys for the Rights dialog; labels are display text.
const businessActions = ['view', 'add', 'edit', 'delete', 'restore'];
exports.modules = [
  { module: 'customer', label: 'Customer', actions: [...businessActions] },
  { module: 'product', label: 'Product', actions: [...businessActions] },
  { module: 'human_resources', label: 'Human Resources', actions: [...businessActions] },
  { module: 'sales', label: 'Sales', actions: [...businessActions] },
  { module: 'reports', label: 'Reports', actions: ['view'] },
];
