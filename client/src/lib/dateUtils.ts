export function safeDateString(dateValue: any): Date {
  if (!dateValue) return new Date();
  const parsed = new Date(dateValue);
  // Check for Invalid Date
  if (isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}
