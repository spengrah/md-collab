import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { error } from './errors.js';
const moduleDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(moduleDir, '..', 'schemas', 'comments-sidecar.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
export const parseSidecar = (json) => {
    let parsed;
    try {
        parsed = JSON.parse(json);
    }
    catch {
        error('SCHEMA_INVALID', 'invalid json');
    }
    if (!validate(parsed)) {
        error('SCHEMA_INVALID', ajv.errorsText(validate.errors));
    }
    return parsed;
};
export const validateSidecar = (data) => validate(data);
//# sourceMappingURL=schema.js.map
//# sourceMappingURL=schema.js.map
