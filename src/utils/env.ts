import { existsSync, readFileSync, writeFileSync } from 'fs';
import { config } from 'dotenv';
import { getProviderById } from '@/providers';

// Load .env on module import
config({ quiet: true });

export function getApiKeyNameForProvider(providerId: string): string | undefined {
  return getProviderById(providerId)?.apiKeyEnvVar;
}

export function getProviderDisplayName(providerId: string): string {
  return getProviderById(providerId)?.displayName ?? providerId;
}

export function checkApiKeyExistsForProvider(providerId: string): boolean {
  const apiKeyName = getApiKeyNameForProvider(providerId);
  if (!apiKeyName) return true;
  return checkApiKeyExists(apiKeyName);
}

export function checkApiKeyExists(apiKeyName: string): boolean {
  const value = process.env[apiKeyName];
  if (value && value.trim() && !value.trim().startsWith('your-')) {
    return true;
  }

  // Also check .env file directly
  if (existsSync('.env')) {
    const envContent = readFileSync('.env', 'utf-8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key.trim() === apiKeyName) {
          const val = valueParts.join('=').trim();
          if (val && !val.startsWith('your-')) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

export function saveApiKeyToEnv(apiKeyName: string, apiKeyValue: string): boolean {
  try {
    let lines: string[] = [];
    let keyUpdated = false;

    if (existsSync('.env')) {
      const existingContent = readFileSync('.env', 'utf-8');
      const existingLines = existingContent.split('\n');

      for (const line of existingLines) {
        const stripped = line.trim();
        if (!stripped || stripped.startsWith('#')) {
          lines.push(line);
        } else if (stripped.includes('=')) {
          const key = stripped.split('=')[0].trim();
          if (key === apiKeyName) {
            lines.push(`${apiKeyName}=${apiKeyValue}`);
            keyUpdated = true;
          } else {
            lines.push(line);
          }
        } else {
          lines.push(line);
        }
      }

      if (!keyUpdated) {
        if (lines.length > 0 && !lines[lines.length - 1].endsWith('\n')) {
          lines.push('');
        }
        lines.push(`${apiKeyName}=${apiKeyValue}`);
      }
    } else {
      lines.push('# LLM API Keys');
      lines.push(`${apiKeyName}=${apiKeyValue}`);
    }

    writeFileSync('.env', lines.join('\n'));

    // Reload environment variables
    config({ override: true, quiet: true });

    return true;
  } catch {
    return false;
  }
}

export function saveApiKeyForProvider(providerId: string, apiKey: string): boolean {
  const apiKeyName = getApiKeyNameForProvider(providerId);
  if (!apiKeyName) return false;
  return saveApiKeyToEnv(apiKeyName, apiKey);
}

// ============================================================================
// Korean Financial Data API Keys
// ============================================================================

/**
 * Get OpenDART API key from environment
 */
export function getOpenDartApiKey(): string | undefined {
  return process.env.OPENDART_API_KEY;
}

/**
 * Check if OpenDART API key exists
 */
export function checkOpenDartApiKey(): boolean {
  return checkApiKeyExists('OPENDART_API_KEY');
}

/**
 * Save OpenDART API key to .env
 */
export function saveOpenDartApiKey(apiKey: string): boolean {
  return saveApiKeyToEnv('OPENDART_API_KEY', apiKey);
}

/**
 * Get KIS (Korea Investment & Securities) App Key from environment
 */
export function getKisAppKey(): string | undefined {
  return process.env.KIS_APP_KEY;
}

/**
 * Get KIS (Korea Investment & Securities) App Secret from environment
 */
export function getKisAppSecret(): string | undefined {
  return process.env.KIS_APP_SECRET;
}

/**
 * Check if KIS credentials exist
 */
export function checkKisCredentials(): boolean {
  return checkApiKeyExists('KIS_APP_KEY') && checkApiKeyExists('KIS_APP_SECRET');
}

/**
 * Save KIS App Key to .env
 */
export function saveKisAppKey(appKey: string): boolean {
  return saveApiKeyToEnv('KIS_APP_KEY', appKey);
}

/**
 * Save KIS App Secret to .env
 */
export function saveKisAppSecret(appSecret: string): boolean {
  return saveApiKeyToEnv('KIS_APP_SECRET', appSecret);
}

// ============================================================================
// BOK ECOS API Key
// ============================================================================

/**
 * Get BOK ECOS API key from environment
 */
export function getBokApiKey(): string | undefined {
  return process.env.BOK_API_KEY;
}

/**
 * Check if BOK API key exists
 */
export function checkBokApiKey(): boolean {
  return checkApiKeyExists('BOK_API_KEY');
}

// ============================================================================
// KOSIS API Key
// ============================================================================

/**
 * Get KOSIS API key from environment
 */
export function getKosisApiKey(): string | undefined {
  return process.env.KOSIS_API_KEY;
}

/**
 * Check if KOSIS API key exists
 */
export function checkKosisApiKey(): boolean {
  return checkApiKeyExists('KOSIS_API_KEY');
}
