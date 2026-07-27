import { Injectable, Logger } from '@nestjs/common';
import type { EmailMessage, EmailPort } from './email.port';

/** Dev transport: writes the message to the log instead of sending it. */
@Injectable()
export class ConsoleEmailAdapter implements EmailPort {
  private readonly logger = new Logger(ConsoleEmailAdapter.name);

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(`[email] to=${message.to} subject=${JSON.stringify(message.subject)}`);
  }
}
