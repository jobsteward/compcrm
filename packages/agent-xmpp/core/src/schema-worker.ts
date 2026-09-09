import { isMainThread, parentPort } from 'node:worker_threads';

process.on('uncaughtException', (error) => {
  console.error('[schema-worker] uncaughtException', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('[schema-worker] unhandledRejection', reason);
});

console.error('[schema-worker] starting, isMainThread=', isMainThread, 'parentPort=', parentPort !== null);

interface ValidationRequest {
  id: number;
  schemaHash: string;
  schema: Record<string, unknown>;
  value: unknown;
}

interface ValidationResponse {
  id: number;
  errors?: string[];
  failure?: string;
}

async function main(): Promise<void> {
  console.error('[schema-worker] importing ajv');
  const { Ajv2020 } = await import('ajv/dist/2020.js');
  console.error('[schema-worker] ajv imported, importing protocol');
  const { isXep0082DateTime } = await import('@agent-xmpp/protocol');
  console.error('[schema-worker] protocol imported, constructing Ajv2020');

  const ajv = new Ajv2020({
    strict: true,
    allErrors: true,
    validateSchema: true,
    unicodeRegExp: true,
    ownProperties: true,
  });
  ajv.addFormat('uri', {
    type: 'string',
    validate(value: string): boolean {
      try {
        return new URL(value).protocol.length > 1;
      } catch {
        return false;
      }
    },
  });
  ajv.addFormat('date-time', isXep0082DateTime);

  console.error('[schema-worker] ajv ready, registering message handler');

  const validators = new Map<string, import('ajv/dist/2020.js').ValidateFunction>();

  parentPort?.on('message', (request: ValidationRequest) => {
    console.error('[schema-worker] received request', request.id);
    const response: ValidationResponse = { id: request.id };
    try {
      let validate = validators.get(request.schemaHash);
      if (!validate) {
        validate = ajv.compile(request.schema);
        validators.set(request.schemaHash, validate);
      }
      response.errors = validate(request.value)
        ? []
        : (validate.errors ?? []).map(
            (error) => `${error.instancePath || '$'} ${error.message ?? error.keyword}`,
          );
    } catch (error) {
      response.failure = error instanceof Error ? error.message : String(error);
    }
    parentPort?.postMessage(response);
  });

  console.error('[schema-worker] ready');
}

main().catch((error) => {
  console.error('[schema-worker] main() rejected', error);
});
