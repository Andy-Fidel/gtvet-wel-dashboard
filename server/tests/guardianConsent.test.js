import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../routes/api.js';
import { Learner } from '../models/Learner.js';
import { Placement } from '../models/Placement.js';
import { GuardianConsent } from '../models/GuardianConsent.js';
import { Document } from '../models/Document.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';

const learnerId = '507f1f77bcf86cd799439011';
const placementId = '507f1f77bcf86cd799439012';
const guardianId = '507f1f77bcf86cd799439013';
const documentId = '507f1f77bcf86cd799439014';
const consentRoute = router.stack.find(layer => layer.route?.path === '/guardian-portal/consent-forms' && layer.route.methods.post).route.stack.at(-1).handle;

const query = value => ({
  select: async () => value,
  sort() { return this; },
  lean: async () => value,
});

for (const submissionMethod of ['Electronic', 'Uploaded']) {
  test(`${submissionMethod.toLowerCase()} guardian consent signs a lean learner with no name virtual`, async t => {
    const learner = {
      _id: learnerId,
      firstName: 'Ama', middleName: 'Akua', lastName: 'Mensah',
      dateOfBirth: new Date('2010-01-01'), institution: 'Home', program: 'Engineering',
    };
    const placement = {
      _id: placementId, status: 'Active', companyName: 'Example Workshop',
      academicYear: '2026/2027', startDate: new Date('2026-09-01'),
    };
    t.mock.method(User, 'findById', () => query({ linkedLearners: [learnerId] }));
    t.mock.method(Learner, 'findById', () => query(learner));
    t.mock.method(Placement, 'find', () => query([placement]));
    t.mock.method(GuardianConsent, 'findOne', async () => null);
    t.mock.method(GuardianConsent, 'create', async payload => {
      const record = new GuardianConsent(payload);
      await record.validate();
      return record;
    });
    t.mock.method(AuditLog, 'create', async audit => {
      assert.match(audit.summary, /Mensah Akua Ama/);
      return audit;
    });
    t.mock.method(User, 'find', () => query([]));
    if (submissionMethod === 'Uploaded') {
      t.mock.method(Document, 'findOne', async () => ({ _id: documentId, fileType: 'application/pdf' }));
    }

    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await consentRoute({
      user: { _id: guardianId, role: 'Guardian', name: 'Parent', institution: 'Home' },
      body: {
        learnerId,
        guardianFullName: 'Parent',
        contactNumber: '123456789',
        relationshipToLearner: 'Mother',
        signatureName: 'Parent',
        submissionMethod,
        ...(submissionMethod === 'Uploaded'
          ? { signedDocumentId: documentId }
          : { learnerDeclaration: { understandsProgram: true, followRules: true, respectfulResponsible: true, reportProblems: true } }),
      },
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.learnerSnapshot.fullName, 'Mensah Akua Ama');
    assert.equal(response.body.reviewStatus, submissionMethod === 'Uploaded' ? 'PendingReview' : 'Accepted');
  });
}
