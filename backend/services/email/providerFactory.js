import MicrosoftOutlookProvider from './MicrosoftOutlookProvider.js';
import GmailProvider from './GmailProvider.js';
import AppError from '../../utils/AppError.js';

export function getEmailProvider(integration) {
  if (!integration) throw new AppError('Email integration not found.', 404);
  if (integration.provider === 'outlook') return new MicrosoftOutlookProvider(integration);
  if (integration.provider === 'gmail') return new GmailProvider(integration);
  throw new AppError(`Unsupported email provider: ${integration.provider}`, 400);
}
