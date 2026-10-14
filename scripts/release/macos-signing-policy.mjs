import { appendFileSync } from 'node:fs';

function readBoolean(name) {
  const value = process.env[name] || 'false';
  if (value !== 'true' && value !== 'false') {
    throw new Error(`${name} must be true or false`);
  }
  return value === 'true';
}

function main() {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath?.trim()) {
    throw new Error('GITHUB_OUTPUT is required');
  }

  const signMacos = readBoolean('WORKFLOW_SIGN_MACOS');
  const allowUnsigned = readBoolean('WORKFLOW_ALLOW_UNSIGNED_MACOS');
  if (signMacos && allowUnsigned) {
    throw new Error('Cannot request both signed and unsigned macOS output');
  }

  if (signMacos) {
    const missing = [
      'APPLE_CERTIFICATE',
      'APPLE_CERTIFICATE_PASSWORD',
      'APPLE_ID',
      'APPLE_PASSWORD',
      'APPLE_TEAM_ID',
    ].filter((name) => !process.env[name]?.trim());
    if (missing.length > 0) {
      throw new Error(`Missing Apple signing secrets: ${missing.join(',')}`);
    }
  }

  const outputs = {
    ready: String(signMacos),
    missing: '',
    unsigned_allowed: String(!signMacos),
    unsigned_reason: signMacos ? '' : allowUnsigned ? 'override' : 'default',
  };
  appendFileSync(
    outputPath,
    `${Object.entries(outputs)
      .map(([name, value]) => `${name}=${value}`)
      .join('\n')}\n`
  );
  console.log(
    signMacos ? 'macOS signing was explicitly requested.' : 'macOS output will be unsigned.'
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
