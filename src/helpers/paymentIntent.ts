import { CloudTasksClient } from '@google-cloud/tasks';
import type { ClientOptions } from 'google-gax';
import type { CredentialBody } from 'google-auth-library';
import {
  BACKEND_URL,
  GCP_LOCATION,
  GCP_PROJECT_ID,
  GCP_QUEUE_NAME,
  GOOGLE_APPLICATION_CREDENTIALS,
  GOOGLE_APPLICATION_CREDENTIALS_JSON,
} from "../config";

let cloudTasksClient: CloudTasksClient | null = null;
let parsedCredentials: CredentialBody | null = null;
let credentialsInitialized = false;
let credentialParseError: Error | null = null;

/**
 * Parse service account credentials from env (if provided) and cache the result.
 */
function getServiceAccountCredentials(): CredentialBody | undefined {
  if (credentialParseError) throw credentialParseError;
  if (credentialsInitialized) return parsedCredentials ?? undefined;

  if (!GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    credentialsInitialized = true;
    return undefined;
  }

  try {
    const rawValue = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS_JSON) as CredentialBody | null;
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
      throw new Error("value must be a JSON object");
    }

    const candidate = rawValue as Record<string, unknown>;
    const clientEmail = typeof candidate.client_email === "string" ? candidate.client_email.trim() : "";
    const privateKeyRaw = typeof candidate.private_key === "string" ? candidate.private_key : "";

    if (!clientEmail) {
      throw new Error("missing client_email");
    }

    if (!privateKeyRaw.trim()) {
      throw new Error("missing private_key");
    }

    // Normalize escaped newlines in private key if necessary
    const normalizedPrivateKey = privateKeyRaw.replace(/\\n/g, "\n");

    parsedCredentials = {
      ...(candidate as CredentialBody),
      client_email: clientEmail,
      private_key: normalizedPrivateKey,
    };

    credentialsInitialized = true;
    return parsedCredentials;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    credentialParseError = new Error(`Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON: ${message}`);
    throw credentialParseError;
  }
}

/**
 * Get or create the Cloud Tasks client (lazy initialization)
 */
function getCloudTasksClient(): CloudTasksClient {
  if (!cloudTasksClient) {
    const clientOptions: ClientOptions = {};
    const credentials = getServiceAccountCredentials();

    if (GCP_PROJECT_ID) {
      clientOptions.projectId = GCP_PROJECT_ID;
    }

    if (credentials) {
      clientOptions.credentials = credentials;
      const credentialsProjectId = (credentials as { project_id?: string }).project_id;
      if (!clientOptions.projectId && typeof credentialsProjectId === "string" && credentialsProjectId.length > 0) {
        clientOptions.projectId = credentialsProjectId;
      }
    } else if (GOOGLE_APPLICATION_CREDENTIALS) {
      clientOptions.keyFilename = GOOGLE_APPLICATION_CREDENTIALS;
    }

    cloudTasksClient = new CloudTasksClient(clientOptions);
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
