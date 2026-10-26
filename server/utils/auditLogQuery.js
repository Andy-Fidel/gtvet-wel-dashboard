import { Types } from 'mongoose';

const ACTIONS = new Set(['CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'UPLOAD', 'AUTH', 'UPDATES']);
const invalidFilter = message => Object.assign(new Error(message), { status: 400 });
const text = (params, key) => {
    const value = params[key];
    if (value === undefined || value === '') return '';
    if (typeof value !== 'string' || value.length > 200) throw invalidFilter(`Invalid ${key} filter`);
    return value.trim();
};
const literal = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const date = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalidFilter('Dates must use YYYY-MM-DD');
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw invalidFilter('Invalid date');
    return parsed;
};

// Keep optional investigation filters separate so they can only narrow authorization scope.
export function auditLogQuery(scope, params = {}) {
    const query = {};
    for (const key of ['entityType', 'actorName', 'institution']) {
        const value = text(params, key);
        if (value) query[key] = value;
    }
    const actorId = text(params, 'actorId');
    if (actorId) {
        if (!/^[a-f0-9]{24}$/i.test(actorId)) throw invalidFilter('Invalid actor ID');
        // Aggregations do not perform Mongoose query casting; totals must match the event list.
        query.actorId = new Types.ObjectId(actorId);
    }
    const action = text(params, 'action');
    if (action && !ACTIONS.has(action)) throw invalidFilter('Invalid action filter');
    if (action) query.action = action === 'UPDATES' ? { $in: ['UPDATE', 'STATUS_CHANGE'] } : action;
    const outcome = text(params, 'outcome');
    if (outcome && !['FAILED', 'SUCCESS'].includes(outcome)) throw invalidFilter('Invalid outcome filter');
    if (outcome) query['metadata.outcome'] = outcome;
    const entityId = text(params, 'entityId');
    if (entityId) query.entityId = { $regex: literal(entityId), $options: 'i' };
    const from = text(params, 'dateFrom');
    const to = text(params, 'dateTo');
    if (from && to && from > to) throw invalidFilter('Start date must be on or before end date');
    if (from || to) {
        query.createdAt = {};
        if (from) query.createdAt.$gte = date(from);
        if (to) {
            const exclusiveEnd = date(to);
            exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
            query.createdAt.$lt = exclusiveEnd;
        }
    }
    const search = text(params, 'search');
    if (search) query.$or = ['summary', 'actorName', 'entityType', 'entityId'].map(key => ({
        [key]: { $regex: literal(search), $options: 'i' },
    }));
    return { $and: [scope, query] };
}
