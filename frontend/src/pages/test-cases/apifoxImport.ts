/**
 * Apifox OpenAPI JSON 导入：解析 paths 并转换为 API 用例输入。
 */
import type {
  ApiAutomationCaseDetails,
  ApiKeyValueItem,
  ApiResponseAssertion,
  CreateTestCaseInput,
  HttpMethod,
} from '../../services/contracts';

type JsonRecord = Record<string, unknown>;

const supportedMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE'];

// ===== OpenAPI 文档解析工具 =====
const asRecord = (value: unknown): JsonRecord | undefined =>
  // 把任意值安全地收敛为普通对象，非对象返回 undefined。
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : undefined;

const asString = (value: unknown): string | undefined =>
  // 基本类型转字符串，undefined/null 之外的复杂类型忽略。
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : undefined;

const firstNonEmpty = (...values: unknown[]): string | undefined =>
  values.map(asString).find((value) => value?.trim());

const resolveReference = (value: unknown, root: JsonRecord): unknown => {
  // 解析 $ref 引用（支持嵌套），带环检测防止无限循环。
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
  // 从 schema 生成示例值：优先 example/default/enum，再按类型递归构造。
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
  // 从参数列表提取 header/query 参数为可编辑键值项。
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
  // 提取 JSON 请求体的示例内容；无 JSON 内容时返回 none。
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
  // 优先取三位状态码响应，缺省按 200。
  const responseMap = asRecord(responses);
  const code = responseMap
    ? Object.keys(responseMap).find((key) => /^\d{3}$/.test(key)) ?? '200'
    : '200';
  return Number(code);
};

export function parseApifoxOpenApi(value: unknown, moduleId: string): CreateTestCaseInput[] {
  // 遍历所有 path × 支持方法，生成 API 用例并附带状态码断言。
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
