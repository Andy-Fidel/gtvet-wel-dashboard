// Match complete identifiers, legacy names, or name words in any order.
export function learnerSearchFilter(value) {
  const query = String(value || '').trim();
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escape(query), 'i');
  return { $or: [
    ...['trackingId', 'indexNumber', 'name', 'program'].map(field => ({ [field]: regex })),
    { $and: query.split(/\s+/).filter(Boolean).map(word => ({ $or: ['firstName', 'middleName', 'lastName'].map(field => ({ [field]: new RegExp(escape(word), 'i') })) })) },
  ] };
}
