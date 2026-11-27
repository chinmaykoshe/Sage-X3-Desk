import EmailIntegration from '../../models/EmailIntegration.js';
import { getEmailProvider } from './providerFactory.js';
import { syncMailboxNow } from './emailProcessingService.js';

const jobQueue = [];
let processingQueue = false;
let schedulerHandle = null;

/**
 * Enqueues an asynchronous email sync/notification job so webhooks return immediately.
 */
export function enqueueEmailJob(job) {
  jobQueue.push({ ...job, attempts: 0 });
  if (!processingQueue) {
    setImmediate(drainQueue);
  }
}

async function drainQueue() {
  if (processingQueue) return;
  processingQueue = true;
  try {
    while (jobQueue.length > 0) {
      const job = jobQueue.shift();
      try {
        const integration = await EmailIntegration.findById(job.mailboxId).select('+encryptedCredentials +clientStateToken');
        if (!integration || !integration.isActive) continue;
        await syncMailboxNow(integration);
      } catch (err) {
        if (job.attempts < 2) {
          jobQueue.push({ ...job, attempts: job.attempts + 1 });
        } else {
          console.warn('Email background job failed:', err.message);
        }
      }
    }
  } finally {
    processingQueue = false;
  }
}

/**
 * Periodic reconciliation & subscription renewal.
 */
export function startEmailBackgroundScheduler() {
  if (schedulerHandle) return;
  schedulerHandle = setInterval(async () => {
    try {
      const active = await EmailIntegration.find({ isActive: true, connectionStatus: 'Connected' }).select(
        '+encryptedCredentials +clientStateToken'
      );
      const now = Date.now();
      for (const integration of active) {
        try {
          // Renew Outlook subscriptions (<12h left) or Gmail watches (<24h left)
          if (integration.subscriptionExpiration) {
            const msLeft = new Date(integration.subscriptionExpiration).getTime() - now;
            const threshold = integration.provider === 'gmail' ? 24 * 3600 * 1000 : 12 * 3600 * 1000;
            if (msLeft < threshold) {
              const provider = getEmailProvider(integration);
              await provider.renewSubscription();
            }
          }
          await syncMailboxNow(integration);
        } catch (err) {
          integration.lastError = err.message;
          await integration.save().catch(() => {});
        }
      }
    } catch {
      // ignore scheduler cycle errors
    }
  }, 5 * 60 * 1000);
}
