import { decryptSecret, encryptSecret, sanitizeEmailHtml } from '../../utils/secretVault.js';

/**
 * Common interface for unified email provider adapters (Outlook & Gmail).
 * All provider-specific data is normalized into one shared structure.
 */
export default class BaseEmailProvider {
  constructor(integration) {
    this.integration = integration;
    this.credentials = decryptSecret(integration?.encryptedCredentials || '');
  }

  async saveCredentials(nextCreds = {}, extraFields = {}) {
    this.credentials = { ...this.credentials, ...nextCreds };
    this.integration.encryptedCredentials = encryptSecret(this.credentials);
    this.integration.hasClientSecret = Boolean(this.credentials.clientSecret);
    this.integration.hasOAuthTokens = Boolean(this.credentials.accessToken || this.credentials.refreshToken);
    Object.assign(this.integration, extraFields);
    await this.integration.save();
  }

  normalizeMessage(raw) {
    return {
      provider: this.integration.provider,
      mailboxId: this.integration._id,
      providerMessageId: String(raw.providerMessageId || ''),
      internetMessageId: String(raw.internetMessageId || '').trim(),
      conversationId: String(raw.conversationId || '').trim(),
      inReplyTo: String(raw.inReplyTo || '').trim(),
      references: Array.isArray(raw.references) ? raw.references.filter(Boolean) : [],
      sender: {
        name: String(raw.sender?.name || '').trim(),
        email: String(raw.sender?.email || '').trim().toLowerCase(),
      },
      recipients: Array.isArray(raw.recipients) ? raw.recipients : [],
      cc: Array.isArray(raw.cc) ? raw.cc : [],
      bcc: Array.isArray(raw.bcc) ? raw.bcc : [],
      subject: String(raw.subject || '(No Subject)').trim(),
      plainBody: String(raw.plainBody || '').trim(),
      htmlBody: sanitizeEmailHtml(raw.htmlBody || ''),
      receivedAt: raw.receivedAt ? new Date(raw.receivedAt) : new Date(),
      attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
      rawMetadata: raw.rawMetadata || {},
      providerMetadata: raw.providerMetadata || {},
    };
  }

  async authenticate() { throw new Error('authenticate() not implemented'); }
  async testConnection() { throw new Error('testConnection() not implemented'); }
  async fetchMessages() { throw new Error('fetchMessages() not implemented'); }
  async getMessageDetails() { throw new Error('getMessageDetails() not implemented'); }
  async getAttachments() { throw new Error('getAttachments() not implemented'); }
  async getThreadInfo() { throw new Error('getThreadInfo() not implemented'); }
  async registerNotifications() { throw new Error('registerNotifications() not implemented'); }
  async renewSubscription() { throw new Error('renewSubscription() not implemented'); }
  async syncMissedMessages() { throw new Error('syncMissedMessages() not implemented'); }
  async disconnect() { throw new Error('disconnect() not implemented'); }
  async sendReply() { throw new Error('sendReply() not implemented'); }
}
