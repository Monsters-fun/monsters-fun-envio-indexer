import { CloudTasksClient } from '@google-cloud/tasks';
import {
  BACKEND_URL,
  GCP_LOCATION,
  GCP_PROJECT_ID,
  GCP_QUEUE_NAME,
} from "../config";

let cloudTasksClient: CloudTasksClient | null = null;

/**
 * Get or create the Cloud Tasks client (lazy initialization)
 */
function getCloudTasksClient(): CloudTasksClient {
  if (!cloudTasksClient) {
    cloudTasksClient = new CloudTasksClient();
  }
  return cloudTasksClient;
}

/**
 * Validates required environment variables for payment processing
 */
function validateEnvironment(): void {
  const missing: string[] = [];
  if (!GCP_PROJECT_ID) missing.push('GCP_PROJECT_ID');
  if (!GCP_LOCATION) missing.push('GCP_LOCATION');
  if (!GCP_QUEUE_NAME) missing.push('GCP_QUEUE_NAME');
  if (!BACKEND_URL) missing.push('BACKEND_URL');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Creates a Cloud Task to forward payment transaction to backend for validation
 * Backend will handle all validation logic including payment intent tags
 */
export async function schedulePaymentConfirmation(
  transactionHash: string
): Promise<void> {
  // Validate environment on first use
  validateEnvironment();
  
  const client = getCloudTasksClient();
  const parent = client.queuePath(GCP_PROJECT_ID!, GCP_LOCATION!, GCP_QUEUE_NAME!);

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: `${BACKEND_URL}/payments/intents/confirm`,
      headers: {
        'Content-Type': 'application/json',
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
    await client.createTask({ parent, task });
  } catch (error: any) {
    // Re-throw with more context for the caller to handle
    throw new Error(`Failed to create Cloud Task for tx ${transactionHash}: ${error.message}`);
  }
}