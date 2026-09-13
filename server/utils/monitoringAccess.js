export const canLogMonitoringVisit = user => ['Admin', 'Manager', 'Staff'].includes(user?.role);

export const monitoringScope = (user, delegatedLearners, learnerOptions = false) => {
  const own = { institution: user.institution || '__unassigned__' };
  return delegatedLearners.length
    ? { $or: [own, { [learnerOptions ? '_id' : 'learner']: { $in: delegatedLearners } }] }
    : own;
};
