export function safeDateString(dateValue: Date | string | number | null | undefined): Date {
  if (!dateValue) return new Date();
  const parsed = new Date(dateValue);
  // Check for Invalid Date
  if (isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}
