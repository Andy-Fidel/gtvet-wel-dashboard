import { UserManagementLock } from '../../models/UserManagementLock.js';

// These route unit tests stub persistence. Real lock contention and lifecycle
// invariants are verified by userManagement.integration.test.js.
export function mockUserManagementLock(t) {
  t.mock.method(UserManagementLock, 'updateOne', async () => ({ matchedCount: 1 }));
  t.mock.method(UserManagementLock, 'findOneAndUpdate', () => ({ lean: async () => ({ _id: 'lifecycle' }) }));
}
