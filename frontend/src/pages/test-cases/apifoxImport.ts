import type {
  ApiAutomationCaseDetails,
  ApiKeyValueItem,
  ApiResponseAssertion,
  CreateTestCaseInput,
  HttpMethod,
} from '../../services/contracts';

type JsonRecord = Record<string, unknown>;

const supportedMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE'];

const asRecord = (value: unknown): JsonRecord | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : undefined;

const firstNonEmpty = (...values: unknown[]): string | undefined =>
  values.map(asString).find((value) => value?.trim());

const resolveReference = (value: unknown, root: JsonRecord): unknown => {
  let current = value;
  const seen = new Set<unknown>();
  while (true) {
    const record = asRecord(current);
    const reference = record?.$ref;
    if (typeof reference !== 'string' || !reference.startsWith('#/') || seen.has(current)) return current;
    seen.add(current);
    current = reference
      .slice(2)
      .split('/')
      .reduce<unknown>((target, segment) => asRecord(target)?.[segment.replace(/~1/g, '/').replace(/~0/g, '~')], root);
  }
};

const valueExample = (schema: unknown, root: JsonRecord): unknown => {
  const record = asRecord(resolveReference(schema, root));
  if (!record) return undefined;
  if (record.example !== undefined) return record.example;
  if (record.default !== undefined) return record.default;
  if (record.enum && Array.isArray(record.enum) && record.enum.length) return record.enum[0];
  if (record.type === 'object' || record.properties) {
    const properties = asRecord(record.properties);
    if (!properties) return {};
    return Object.fromEntries(
      Object.entries(properties)
        .map(([key, property]) => [key, valueExample(property, root)])
        .filter(([, value]) => value !== undefined),
    );
  }
  if (record.type === 'array') {
    const item = valueExample(record.items, root);
    return item === undefined ? [] : [item];
  }
  if (record.type === 'integer' || record.type === 'number') return 0;
  if (record.type === 'boolean') return false;
  return '';
};

const parameterValue = (parameter: JsonRecord, root: JsonRecord): string =>
  asString(parameter.example) ??
  asString(parameter.default) ??
  (Array.isArray(parameter.enum) && parameter.enum.length ? asString(parameter.enum[0]) : undefined) ??
  asString(valueExample(parameter.schema, root)) ??
  '';

const keyValues = (parameters: unknown[], location: 'header' | 'query', root: JsonRecord): ApiKeyValueItem[] =>
  parameters
    .map((parameter) => asRecord(resolveReference(parameter, root)))
    .filter((parameter): parameter is JsonRecord => Boolean(parameter && parameter.in === location))
    .map((parameter) => ({
      enabled: parameter.required !== false,
      key: asString(parameter.name) ?? '',
      value: parameterValue(parameter, root),
    }))
    .filter((item) => item.key);

const requestBody = (value: unknown, root: JsonRecord): Pick<ApiAutomationCaseDetails, 'bodyType' | 'bodyContent'> => {
  const body = asRecord(resolveReference(value, root));
  const content = asRecord(body?.content);
  if (!content) return { bodyType: 'none', bodyContent: '' };
  const mediaType = Object.keys(content).find((key) => key === 'application/json') ?? Object.keys(content)[0];
  if (!mediaType) return { bodyType: 'none', bodyContent: '' };
  const media = asRecord(resolveReference(content[mediaType], root));
  const examples = asRecord(media?.examples);
  const exampleValue = examples ? asRecord(examples[Object.keys(examples)[0]])?.value : undefined;
  const example = media?.example ?? exampleValue ?? valueExample(media?.schema, root);
  return {
    bodyType: mediaType.includes('json') ? 'json' : 'none',
    bodyContent: mediaType.includes('json') && example !== undefined ? JSON.stringify(example, null, 2) : '',
  };
};

const expectedStatus = (responses: unknown): number => {
  const responseMap = asRecord(responses);
  const code = responseMap
    ? Object.keys(responseMap).find((key) => /^\d{3}$/.test(key)) ?? '200'
    : '200';
  return Number(code);
};

export function parseApifoxOpenApi(value: unknown, moduleId: string): CreateTestCaseInput[] {
  const document = asRecord(value);
  const paths = asRecord(document?.paths);
  if (!paths) throw new Error('导入文件不是有效的 Apifox OpenAPI JSON（缺少 paths）');
  const root = document ?? {};

  const cases: CreateTestCaseInput[] = [];
  Object.entries(paths).forEach(([endpoint, pathItemValue]) => {
    const pathItem = asRecord(pathItemValue);
    if (!pathItem) return;
    const pathParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    supportedMethods.forEach((method) => {
      const operation = asRecord(resolveReference(pathItem[method.toLowerCase()], root));
      if (!operation) return;
      const operationParameters = Array.isArray(operation.parameters) ? operation.parameters : [];
      const parameters = [...pathParameters, ...operationParameters];
      const headers = keyValues(parameters, 'header', root);
      const queryParams = keyValues(parameters, 'query', root);
      const body = requestBody(operation.requestBody, root);
      const status = expectedStatus(operation.responses);
      const name = firstNonEmpty(operation.summary, operation.operationId) ?? `${method} ${endpoint}`;
      const assertions: ApiResponseAssertion[] = [
        { type: 'statusCode', target: '', comparison: 'equals', expected: String(status) },
      ];
      const details: ApiAutomationCaseDetails = {
        headers,
        queryParams,
        bodyType: body.bodyType,
        bodyContent: body.bodyContent,
        bodyFields: [],
        assertions,
        extracts: [],
      };
      cases.push({
        type: 'api',
        moduleId,
        name,
        priority: 'P1',
        status: '维护中',
        endpoint,
        method,
        expectedStatus: status,
        apiDetails: details,
      });
    });
  });
  if (!cases.length) throw new Error('导入文件中没有找到可导入的接口用例');
  return cases;
}
