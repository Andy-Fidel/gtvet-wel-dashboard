import { Placement } from '../models/Placement.js';
import { PartnerSlotAllocation } from '../models/PartnerSlotAllocation.js';

const asDate = value => {
  const date = value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date : new Date();
};

export async function partnerCapacityAt({ partner, institution, date, excludePlacementId = null }) {
  const point = asDate(date);
  const [allocations, activeCounts] = await Promise.all([
    PartnerSlotAllocation.find({ partner: partner._id, status: 'Approved', startDate: { $lte: point }, endDate: { $gte: point } }).select('institution slots').lean(),
    Placement.aggregate([
      { $match: { partner: partner._id, status: 'Active', ...(excludePlacementId ? { _id: { $ne: excludePlacementId } } : {}) } },
      { $group: { _id: '$institution', count: { $sum: 1 } } },
    ]),
  ]);
  const reservedByInstitution = new Map();
  for (const allocation of allocations) reservedByInstitution.set(allocation.institution, (reservedByInstitution.get(allocation.institution) || 0) + allocation.slots);
  const activeByInstitution = new Map(activeCounts.map(item => [item._id || '', item.count]));
  const reservedTotal = [...reservedByInstitution.values()].reduce((sum, value) => sum + value, 0);
  const sharedCapacity = Math.max(0, partner.totalSlots - reservedTotal);
  let sharedUsed = 0;
  for (const [name, count] of activeByInstitution) sharedUsed += Math.max(0, count - (reservedByInstitution.get(name) || 0));
  const reservedSlots = reservedByInstitution.get(institution) || 0;
  const institutionActive = activeByInstitution.get(institution) || 0;
  const reservedAvailable = Math.max(0, reservedSlots - institutionActive);
  const sharedAvailable = Math.max(0, sharedCapacity - sharedUsed);
  return {
    totalSlots: partner.totalSlots,
    reservedSlots,
    reservedAvailable,
    sharedCapacity,
    sharedAvailable,
    availableSlots: reservedAvailable + sharedAvailable,
    institutionActive,
    reservedTotal,
  };
}

export async function decoratePartnerCapacities(partners, institution, date = new Date()) {
  if (!institution || !partners.length) return partners;
  const point = asDate(date);
  const partnerIds = partners.map(partner => partner._id);
  const [allocations, activeCounts] = await Promise.all([
    PartnerSlotAllocation.find({ partner: { $in: partnerIds }, status: 'Approved', startDate: { $lte: point }, endDate: { $gte: point } }).select('partner institution slots').lean(),
    Placement.aggregate([{ $match: { partner: { $in: partnerIds }, status: 'Active' } }, { $group: { _id: { partner: '$partner', institution: '$institution' }, count: { $sum: 1 } } }]),
  ]);
  const allocationMap = new Map();
  for (const item of allocations) {
    const key = String(item.partner);
    if (!allocationMap.has(key)) allocationMap.set(key, new Map());
    const map = allocationMap.get(key);
    map.set(item.institution, (map.get(item.institution) || 0) + item.slots);
  }
  const activeMap = new Map();
  for (const item of activeCounts) {
    const key = String(item._id.partner);
    if (!activeMap.has(key)) activeMap.set(key, new Map());
    activeMap.get(key).set(item._id.institution || '', item.count);
  }
  return partners.map(partner => {
    const reserved = allocationMap.get(String(partner._id)) || new Map();
    const active = activeMap.get(String(partner._id)) || new Map();
    const reservedTotal = [...reserved.values()].reduce((sum, value) => sum + value, 0);
    const sharedCapacity = Math.max(0, partner.totalSlots - reservedTotal);
    let sharedUsed = 0;
    for (const [name, count] of active) sharedUsed += Math.max(0, count - (reserved.get(name) || 0));
    const reservedSlots = reserved.get(institution) || 0;
    const institutionActive = active.get(institution) || 0;
    const reservedAvailable = Math.max(0, reservedSlots - institutionActive);
    const sharedAvailable = Math.max(0, sharedCapacity - sharedUsed);
    return { ...partner, institutionCapacity: { reservedSlots, reservedAvailable, sharedAvailable, availableSlots: reservedAvailable + sharedAvailable } };
  });
}
