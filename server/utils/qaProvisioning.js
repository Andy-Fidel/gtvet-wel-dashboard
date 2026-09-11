import { User } from '../models/User.js';
import { Institution } from '../models/Institution.js';
import { IndustryPartner } from '../models/IndustryPartner.js';
import { Learner } from '../models/Learner.js';

const ALLOWED_ROLES = new Set([
  'SuperAdmin',
  'HQManager',
  'HQStaff',
  'RegionalAdmin',
  'Admin',
  'Manager',
  'Staff',
  'IndustryPartner',
  'Guardian',
]);

const resolveScopedFields = async (account) => {
  const fields = {
    institution: undefined,
    region: undefined,
    hqScopeType: undefined,
    partnerId: undefined,
    partnerPortalRole: undefined,
    linkedLearners: [],
  };

  if (account.role === 'SuperAdmin') return fields;

  if (account.role === 'HQManager' || account.role === 'HQStaff') {
    fields.hqScopeType = account.hqScopeType || 'National';
    if (fields.hqScopeType === 'Region') {
      fields.region = account.region;
    } else if (fields.hqScopeType === 'Institution') {
      const institution = await Institution.findOne({ name: account.institution }).select('name region');
      if (!institution) throw new Error(`Institution not found for ${account.email}`);
      fields.institution = institution.name;
      fields.region = institution.region;
    }
    return fields;
  }

  if (account.role === 'RegionalAdmin') {
    fields.region = account.region;
    fields.institution = 'N/A';
    return fields;
  }

  if (['Admin', 'Manager', 'Staff'].includes(account.role)) {
    const institution = await Institution.findOne({ name: account.institution }).select('name region');
    if (!institution) throw new Error(`Institution not found for ${account.email}`);
    fields.institution = institution.name;
    fields.region = institution.region;
    return fields;
  }

  if (account.role === 'IndustryPartner') {
    const partner = await IndustryPartner.findOne({ name: account.partnerName }).select('_id region');
    if (!partner) throw new Error(`Industry partner not found for ${account.email}`);
    fields.institution = 'N/A';
    fields.region = partner.region;
    fields.partnerId = partner._id;
    fields.partnerPortalRole = account.partnerPortalRole || 'Supervisor';
    return fields;
  }

  const learner = await Learner.findOne({ trackingId: account.learnerTrackingId }).select('_id institution region');
  if (!learner) throw new Error(`Linked learner not found for ${account.email}`);
  fields.institution = learner.institution;
  fields.region = learner.region;
  fields.linkedLearners = [learner._id];
  return fields;
};

export const provisionQaTestersFromEnvironment = async () => {
  if (process.env.QA_PROVISION_ENABLED !== 'true') return;

  const rawPayload = process.env.QA_TESTER_ACCOUNTS_JSON;
  if (!rawPayload) throw new Error('QA_PROVISION_ENABLED requires QA_TESTER_ACCOUNTS_JSON');

  const accounts = JSON.parse(rawPayload);
  if (!Array.isArray(accounts) || accounts.length === 0 || accounts.length > 25) {
    throw new Error('QA tester payload must contain between 1 and 25 accounts');
  }

  const provisioned = [];
  for (const account of accounts) {
    if (!account.name || !account.email || !account.password || !ALLOWED_ROLES.has(account.role)) {
      throw new Error('Every QA tester requires a name, email, password, and valid role');
    }

    const email = account.email.trim().toLowerCase();
    const scopedFields = await resolveScopedFields(account);
    let user = await User.findOne({ email });
    if (!user) user = new User({ email });

    user.set({
      name: account.name,
      email,
      password: account.password,
      role: account.role,
      status: 'Active',
      phone: account.phone || '',
      passwordChangeRequired: false,
      invitationSentAt: new Date(),
      inviteAcceptedAt: new Date(),
      resetPasswordToken: undefined,
      resetPasswordExpires: undefined,
      ...scopedFields,
    });
    await user.save();
    provisioned.push(`${email}:${account.role}`);
  }

  console.log(`QA_PROVISION_SUCCESS count=${provisioned.length} accounts=${provisioned.join(',')}`);
};
