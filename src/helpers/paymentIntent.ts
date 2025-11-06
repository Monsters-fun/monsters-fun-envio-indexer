import { createCloudTasksContext } from './cloudTasksClient';
import { BACKEND_URL, PAYMENTS_CLOUD_TASKS_SECRET } from '../config';

let environmentValidated = false;

export interface PaymentDetectionDetails {
  transactionHash: string;
  from: string;
  to: string;
  amount: string | number | bigint;
  blockNumber?: string | number | bigint;
}

export function logPaymentDetection(details: PaymentDetectionDetails): void {
  console.log('Detected payment intent transfer', {
    transactionHash: details.transactionHash,
    from: details.from,
    to: details.to,
    amount: details.amount,
    blockNumber: details.blockNumber,
  });
}

export interface PaymentConfirmationTaskMetadata {
  taskName?: string;
  projectId: string;
  location: string;
  queueName: string;
}

function validateEnvironment(): void {
  if (environmentValidated) return;

  const missing: string[] = [];
  if (!BACKEND_URL) missing.push('BACKEND_URL');
  if (!PAYMENTS_CLOUD_TASKS_SECRET) missing.push('PAYMENTS_CLOUD_TASKS_SECRET');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  environmentValidated = true;
}

/**
 * Creates a Cloud Task to forward payment transaction to backend for validation
 * Backend will handle all validation logic including payment intent tags
 */
export async function schedulePaymentConfirmation(
  transactionHash: string
): Promise<PaymentConfirmationTaskMetadata> {
  // Validate environment on first use
  validateEnvironment();
  const { client, parent, queueName, projectId, location } = createCloudTasksContext();

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: `${BACKEND_URL}/payments/intents/confirm`,
      headers: {
        'Content-Type': 'application/json',
        'x-monsters-cloudtasks-secret': PAYMENTS_CLOUD_TASKS_SECRET,
        'X-Cloud-Task': 'payment-confirmation',
        'X-Source': 'envio-indexer',
      },
      body: Buffer.from(
        JSON.stringify({
          transactionHash,
          source: 'envio-indexer',
        })
      ).toString('base64'),
    },
  };

  try {
    const [response] = await client.createTask({ parent, task });
    const taskName = response?.name ?? undefined;
    return {
      taskName,
      queueName,
      projectId,
      location,
    };
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to create Cloud Task for tx ${transactionHash} (queue=${queueName}, project=${projectId}, location=${location}): ${message}`
    );
  }
}
