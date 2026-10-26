const SORT_FIELDS = new Set(['name', 'email', 'role', 'status', 'createdAt']);

export function userRegistrySort({ sortBy = 'createdAt', sortDirection = 'desc' } = {}) {
  if (!SORT_FIELDS.has(sortBy) || !['asc', 'desc'].includes(sortDirection)) {
    throw Object.assign(new Error('Invalid user directory sort'), { status: 400 });
  }
  // A unique final key keeps equal values stable across page boundaries.
  return sortBy === 'createdAt'
    ? { createdAt: sortDirection === 'asc' ? 1 : -1, name: 1, _id: 1 }
    : { [sortBy]: sortDirection === 'asc' ? 1 : -1, _id: 1 };
}
