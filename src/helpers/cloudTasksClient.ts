import { CloudTasksClient } from '@google-cloud/tasks';
import type { ClientOptions } from 'google-gax';
import type { CredentialBody } from 'google-auth-library';
import {
  GCP_LOCATION,
  GCP_PROJECT_ID,
  GCP_QUEUE_NAME,
  GOOGLE_APPLICATION_CREDENTIALS,
  GOOGLE_APPLICATION_CREDENTIALS_JSON,
} from '../config';

let cloudTasksClient: CloudTasksClient | null = null;
let parsedCredentials: CredentialBody | null = null;
let credentialsInitialized = false;
let credentialParseError: Error | null = null;

function parseCredentialsObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('value must be a JSON object');
  }
  return raw as Record<string, unknown>;
}

function tryParseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parseCredentialsObject(parsed);
  } catch (error) {
    return null;
  }
}

function decodeMaybeBase64(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('value is empty');
  }

  const direct = tryParseJsonObject(trimmed);
  if (direct) return direct;

  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    const decodedTrimmed = decoded.trim();
    const parsed = decodedTrimmed ? tryParseJsonObject(decodedTrimmed) : null;
    if (parsed) return parsed;
  } catch (_error) {
    // fall through to generic error below
  }

  throw new Error('value must be valid JSON or base64-encoded JSON');
}

export function getServiceAccountCredentials(): CredentialBody | undefined {
  if (credentialParseError) throw credentialParseError;
  if (credentialsInitialized) return parsedCredentials ?? undefined;

  if (!GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    credentialsInitialized = true;
    return undefined;
  }

  try {
    const candidate = decodeMaybeBase64(GOOGLE_APPLICATION_CREDENTIALS_JSON);
    const clientEmail = typeof candidate.client_email === 'string' ? candidate.client_email.trim() : '';
    const privateKeyRaw = typeof candidate.private_key === 'string' ? candidate.private_key : '';

    if (!clientEmail) {
      throw new Error('missing client_email');
    }

    if (!privateKeyRaw.trim()) {
      throw new Error('missing private_key');
    }

    const normalizedPrivateKey = privateKeyRaw.replace(/\\n/g, '\n');

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

export function getCloudTasksClient(): CloudTasksClient {
  if (!cloudTasksClient) {
    const clientOptions: ClientOptions = {};
    const credentials = getServiceAccountCredentials();

    if (GCP_PROJECT_ID) {
      clientOptions.projectId = GCP_PROJECT_ID;
    }

    if (credentials) {
      clientOptions.credentials = credentials;
      const credentialsProjectId = (credentials as { project_id?: string }).project_id;
      if (!clientOptions.projectId && typeof credentialsProjectId === 'string' && credentialsProjectId.length > 0) {
        clientOptions.projectId = credentialsProjectId;
      }
    } else if (GOOGLE_APPLICATION_CREDENTIALS) {
      clientOptions.keyFilename = GOOGLE_APPLICATION_CREDENTIALS;
    }

    cloudTasksClient = new CloudTasksClient(clientOptions);
  }

  return cloudTasksClient;
}

export interface CloudTasksContextOptions {
  queueName?: string;
  projectId?: string;
  location?: string;
  credentialsJson?: string;
  credentialsPath?: string;
}

export interface CloudTasksContext {
  client: CloudTasksClient;
  parent: string;
  queueName: string;
  projectId: string;
  location: string;
}

function normalizeConfigValue(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseCredentialsString(value: string): CredentialBody {
  const candidate = decodeMaybeBase64(value);
  const clientEmail = typeof candidate.client_email === 'string' ? candidate.client_email.trim() : '';
  const privateKeyRaw = typeof candidate.private_key === 'string' ? candidate.private_key : '';

  if (!clientEmail) {
    throw new Error('missing client_email');
  }

  if (!privateKeyRaw.trim()) {
    throw new Error('missing private_key');
  }

  const normalizedPrivateKey = privateKeyRaw.replace(/\\n/g, '\n');

  return {
    ...(candidate as CredentialBody),
    client_email: clientEmail,
    private_key: normalizedPrivateKey,
  };
}

function createCustomCloudTasksClient(options: {
  projectId?: string;
  credentialsJson?: string;
  credentialsPath?: string;
}): CloudTasksClient {
  const clientOptions: ClientOptions = {};

  if (options.projectId) {
    clientOptions.projectId = options.projectId;
  }

  if (options.credentialsJson && options.credentialsJson.trim().length > 0) {
    try {
      clientOptions.credentials = parseCredentialsString(options.credentialsJson);
      if (!clientOptions.projectId) {
        const credentialsProjectId = (clientOptions.credentials as { project_id?: string }).project_id;
        if (typeof credentialsProjectId === 'string' && credentialsProjectId.length > 0) {
          clientOptions.projectId = credentialsProjectId;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid custom GOOGLE_APPLICATION_CREDENTIALS_JSON: ${message}`);
    }
  } else if (options.credentialsPath && options.credentialsPath.trim().length > 0) {
    clientOptions.keyFilename = options.credentialsPath;
  } else {
    const credentials = getServiceAccountCredentials();
    if (credentials) {
      clientOptions.credentials = credentials;
      const credentialsProjectId = (credentials as { project_id?: string }).project_id;
      if (!clientOptions.projectId && typeof credentialsProjectId === 'string' && credentialsProjectId.length > 0) {
        clientOptions.projectId = credentialsProjectId;
      }
    } else if (GOOGLE_APPLICATION_CREDENTIALS) {
      clientOptions.keyFilename = GOOGLE_APPLICATION_CREDENTIALS;
    }
  }

  return new CloudTasksClient(clientOptions);
}

export function createCloudTasksContext(options: CloudTasksContextOptions = {}): CloudTasksContext {
  const projectId = normalizeConfigValue(options.projectId ?? GCP_PROJECT_ID);
  const location = normalizeConfigValue(options.location ?? GCP_LOCATION);
  const queueName = normalizeConfigValue(options.queueName ?? GCP_QUEUE_NAME);
  const credentialsJson = normalizeConfigValue(options.credentialsJson);
  const credentialsPath = normalizeConfigValue(options.credentialsPath);

  if (!projectId) {
    throw new Error('Missing GCP_PROJECT_ID configuration');
  }

  if (!location) {
    throw new Error('Missing GCP_LOCATION configuration');
  }

  if (!queueName) {
    throw new Error('Missing Cloud Tasks queue name (set GCP_QUEUE_NAME or provide one explicitly)');
  }

  const shouldUseCustomClient =
    Boolean(credentialsJson) || Boolean(credentialsPath) || Boolean(options.projectId) || Boolean(options.location);

  const client = shouldUseCustomClient
    ? createCustomCloudTasksClient({
        projectId,
        credentialsJson: credentialsJson || undefined,
        credentialsPath: credentialsPath || undefined,
      })
    : getCloudTasksClient();
  const parent = client.queuePath(projectId, location, queueName);

  return { client, parent, queueName, projectId, location };
}

export function resetCloudTasksClientForTests(): void {
  cloudTasksClient = null;
  parsedCredentials = null;
  credentialsInitialized = false;
  credentialParseError = null;
}
