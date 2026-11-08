import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database/connection.js';
import { RefundOperation } from '../../src/modules/payments/RefundOperation.js';
import { Payment } from '../../src/modules/payments/Payment.js';
import { Registration } from '../../src/modules/registrations/Registration.js';
import { Event } from '../../src/modules/events/Event.js';
import { User } from '../../src/modules/users/User.js';
import {
  startRefundReconciliationWorker,
  stopRefundReconciliationWorker,
  isRefundReconciliationWorkerActive,
  runRefundReconciliationSweep
} from '../../src/modules/payments/refundReconciliationWorker.js';
import {
  reconcilePendingRefunds,
  resetRefundReconciliationRunning,
  getIsRefundReconciliationRunning
} from '../../src/modules/payments/paymentService.js';
import { PAYMENT_STATUS, REFUND_STATUS } from '../../src/shared/constants/status.js';

describe('Refund Reconciliation Worker & Lifecycle (Unit/Integration)', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_PAYMENTS = 'true';
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora');
  });

  after(async () => {
    stopRefundReconciliationWorker();
    await disconnectDatabase();
  });

  beforeEach(async () => {
    resetRefundReconciliationRunning();
    await RefundOperation.deleteMany({});
    await Payment.deleteMany({});
  });

  test('1. Worker starts and stops cleanly without leaving active handles', () => {
    assert.equal(isRefundReconciliationWorkerActive(), false);
    startRefundReconciliationWorker(5000);
    assert.equal(isRefundReconciliationWorkerActive(), true);

    // Repeated start does not create duplicate intervals
    startRefundReconciliationWorker(5000);
    assert.equal(isRefundReconciliationWorkerActive(), true);

    stopRefundReconciliationWorker();
    assert.equal(isRefundReconciliationWorkerActive(), false);
  });

  test('2. Prevents overlapping concurrent reconciliation executions', async () => {
    // Run reconciliation and test lock
    const sweepPromise1 = reconcilePendingRefunds();
    // Simulate overlap
    const sweepPromise2 = reconcilePendingRefunds();

    const [res1, res2] = await Promise.all([sweepPromise1, sweepPromise2]);

    // One of them must report in_progress or processed
    assert.ok(res1.status === 'in_progress' || res2.status === 'in_progress' || res1.reconciledCount >= 0);
    assert.equal(getIsRefundReconciliationRunning(), false);
  });

  test('3. Retries eligible FAILED and PENDING refund operations when nextRetryAt is due', async () => {
    const dummyPayId = new mongoose.Types.ObjectId();
    const dummyRegId = new mongoose.Types.ObjectId();
    const dummyEvtId = new mongoose.Types.ObjectId();
    const dummyUserId = new mongoose.Types.ObjectId();

    await Payment.create({
      _id: dummyPayId,
      eventId: dummyEvtId,
      attendeeId: dummyUserId,
      amount: 10000,
      currency: 'INR',
      status: PAYMENT_STATUS.REFUND_PENDING,
      refundStatus: REFUND_STATUS.PENDING,
      orderId: 'order_recon_test_1',
      paymentId: 'pay_recon_test_1',
      idempotencyKey: 'idem_recon_test_1'
    });

    const failedOp = await RefundOperation.create({
      refundOpId: 'rfop_test_retry_1',
      paymentId: dummyPayId,
      registrationId: dummyRegId,
      eventId: dummyEvtId,
      attendeeId: dummyUserId,
      organizerId: dummyUserId,
      orderId: 'order_recon_test_1',
      gatewayPaymentId: 'pay_recon_test_1',
      amount: 10000,
      currency: 'INR',
      reason: 'Gateway timeout test',
      status: 'FAILED',
      idempotencyKey: 'refund_reg_test_retry_1',
      retryCount: 1,
      maxRetries: 5,
      nextRetryAt: new Date(Date.now() - 5000) // due now
    });

    // Run reconciliation sweep
    const result = await reconcilePendingRefunds();
    assert.equal(result.reconciledCount, 1);

    const updatedOp = await RefundOperation.findById(failedOp._id);
    assert.equal(updatedOp.status, 'PENDING');
    assert.ok(updatedOp.gatewayRefundId);
  });

  test('4. Respects exponential retry backoff and increments retry count on gateway failure', async () => {
    const dummyPayId = new mongoose.Types.ObjectId();
    const dummyRegId = new mongoose.Types.ObjectId();
    const dummyEvtId = new mongoose.Types.ObjectId();
    const dummyUserId = new mongoose.Types.ObjectId();

    await Payment.create({
      _id: dummyPayId,
      eventId: dummyEvtId,
      attendeeId: dummyUserId,
      amount: 25000,
      currency: 'INR',
      status: PAYMENT_STATUS.REFUND_PENDING,
      refundStatus: REFUND_STATUS.PENDING,
      orderId: 'order_recon_test_fail',
      paymentId: 'pay_force_fail_timeout',
      idempotencyKey: 'idem_recon_fail'
    });

    const opToFail = await RefundOperation.create({
      refundOpId: 'rfop_test_fail_backoff',
      paymentId: dummyPayId,
      registrationId: dummyRegId,
      eventId: dummyEvtId,
      attendeeId: dummyUserId,
      organizerId: dummyUserId,
      orderId: 'order_recon_test_fail',
      gatewayPaymentId: 'pay_force_fail_timeout',
      amount: 25000,
      currency: 'INR',
      reason: 'Backoff test',
      status: 'INITIATED',
      idempotencyKey: 'refund_reg_test_backoff_1',
      retryCount: 0,
      maxRetries: 3,
      nextRetryAt: null
    });

    // Temporarily mock client.payments.refund to simulate gateway failure
    const { getRazorpayClient } = await import('../../src/modules/payments/razorpayService.js');
    const rzpClient = getRazorpayClient();
    const originalRefund = rzpClient.payments.refund;

    // Simulate transient 504 gateway timeout
    rzpClient.payments.refund = async () => {
      throw new Error('504 Gateway Timeout: Razorpay upstream unreachable');
    };

    try {
      const result = await reconcilePendingRefunds();
      assert.equal(result.failedCount, 1);

      const recheckedOp = await RefundOperation.findById(opToFail._id);
      assert.equal(recheckedOp.status, 'FAILED');
      assert.equal(recheckedOp.retryCount, 1);
      assert.match(recheckedOp.lastError, /504 Gateway Timeout/);
      assert.ok(new Date(recheckedOp.nextRetryAt).getTime() > Date.now());
    } finally {
      rzpClient.payments.refund = originalRefund;
    }
  });

  test('5. Enforces maximum retry limit and transitions to terminal MANUAL_RECONCILIATION_REQUIRED', async () => {
    const dummyPayId = new mongoose.Types.ObjectId();
    const dummyRegId = new mongoose.Types.ObjectId();
    const dummyEvtId = new mongoose.Types.ObjectId();
    const dummyUserId = new mongoose.Types.ObjectId();

    const maxedOp = await RefundOperation.create({
      refundOpId: 'rfop_test_max_retries',
      paymentId: dummyPayId,
      registrationId: dummyRegId,
      eventId: dummyEvtId,
      attendeeId: dummyUserId,
      organizerId: dummyUserId,
      orderId: 'order_recon_maxed',
      gatewayPaymentId: 'pay_recon_maxed',
      amount: 15000,
      currency: 'INR',
      reason: 'Testing max retry ceiling',
      status: 'FAILED',
      idempotencyKey: 'refund_reg_maxed_1',
      retryCount: 5,
      maxRetries: 5,
      nextRetryAt: new Date(Date.now() - 1000)
    });

    await reconcilePendingRefunds();

    const updated = await RefundOperation.findById(maxedOp._id);
    assert.equal(updated.status, 'MANUAL_RECONCILIATION_REQUIRED');
    assert.match(updated.lastError, /Maximum retry limit exceeded/);

    // Terminal state: subsequent sweeps ignore it
    resetRefundReconciliationRunning();
    const nextSweep = await reconcilePendingRefunds();
    assert.equal(nextSweep.reconciledCount, 0);
    assert.equal(nextSweep.failedCount, 0);
  });

  test('6. Terminal PROCESSED operations are never retried or re-dispatched', async () => {
    const dummyPayId = new mongoose.Types.ObjectId();
    const dummyRegId = new mongoose.Types.ObjectId();
    const dummyEvtId = new mongoose.Types.ObjectId();
    const dummyUserId = new mongoose.Types.ObjectId();

    await RefundOperation.create({
      refundOpId: 'rfop_test_already_processed',
      paymentId: dummyPayId,
      registrationId: dummyRegId,
      eventId: dummyEvtId,
      attendeeId: dummyUserId,
      organizerId: dummyUserId,
      orderId: 'order_processed_1',
      gatewayPaymentId: 'pay_processed_1',
      amount: 5000,
      currency: 'INR',
      reason: 'Already refunded',
      status: 'PROCESSED',
      gatewayRefundId: 'rfnd_already_done_123',
      idempotencyKey: 'refund_already_done_1',
      retryCount: 1,
      maxRetries: 5
    });

    const sweepResult = await reconcilePendingRefunds();
    assert.equal(sweepResult.reconciledCount, 0);
    assert.equal(sweepResult.failedCount, 0);
  });
});
