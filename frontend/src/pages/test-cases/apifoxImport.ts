/**
 * Apifox OpenAPI JSON 导入：解析 paths 并转换为 API 用例输入。
 */
import type {
  ApiAutomationCaseDetails,
  ApiKeyValueItem,
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

const nativeParameterValue = (parameter: JsonRecord): string =>
  // Apifox 原生导出把示例直接放在参数上，schema 仅作为无示例时的兜底。
  asString(parameter.example) ??
  asString(parameter.default) ??
  asString(valueExample(parameter.schema, {})) ??
  '';

const nativeKeyValues = (
  parameters: unknown,
  location: 'header' | 'query',
): ApiKeyValueItem[] => {
  // 原生格式按位置分组参数，不使用 OpenAPI 的 `in` 字段。
  const parameterMap = asRecord(parameters);
  const entries = Array.isArray(parameterMap?.[location]) ? parameterMap[location] : [];
  return entries
    .map(asRecord)
    .filter((parameter): parameter is JsonRecord => Boolean(parameter))
    .map((parameter) => ({
      enabled: parameter.enable !== false && parameter.required !== false,
      key: asString(parameter.name) ?? '',
      value: nativeParameterValue(parameter),
    }))
    .filter((item) => item.key);
};

const mergeNativeHeaders = (
  commonHeaders: ApiKeyValueItem[],
  caseHeaders: ApiKeyValueItem[],
): ApiKeyValueItem[] => {
  // 公共请求头作为默认值，接口级同名请求头覆盖公共值，保持 Apifox 的继承语义。
  const merged = new Map(commonHeaders.map((item) => [item.key.toLowerCase(), item]));
  caseHeaders.forEach((item) => merged.set(item.key.toLowerCase(), item));
  return Array.from(merged.values());
};

const replaceNativePathParameters = (path: string, parameters: unknown): string => {
  // 导入时优先使用路径参数 example/default，避免把 `{project_id}` 原样发送给目标服务。
  const values = new Map(
    (Array.isArray(parameters) ? parameters : [])
      .map(asRecord)
      .filter((parameter): parameter is JsonRecord => Boolean(parameter?.name))
      .map((parameter) => [String(parameter.name), nativeParameterValue(parameter)]),
  );
  return path.replace(/\{([^}]+)\}/g, (placeholder, name: string) => {
    const value = values.get(name);
    return value?.trim() ? value : placeholder;
  });
};

const nativeRequestBody = (value: unknown): Pick<ApiAutomationCaseDetails, 'bodyType' | 'bodyContent'> => {
  // 原生导出的 JSON 示例可能是字符串，也可能已经是对象；统一成表单可编辑的 JSON 文本。
  const body = asRecord(value);
  const bodyType = asString(body?.type) ?? 'none';
  if (bodyType === 'none') return { bodyType: 'none', bodyContent: '' };
  const examples = Array.isArray(body?.examples) ? body.examples : [];
  const example = asRecord(examples[0])?.value;
  const parameterEntries = Array.isArray(body?.parameters) ? body.parameters : [];
  const parameterObject = Object.fromEntries(
    parameterEntries
      .map(asRecord)
      .filter((parameter): parameter is JsonRecord => Boolean(parameter && parameter.name))
      .map((parameter) => [String(parameter.name), nativeParameterValue(parameter)]),
  );
  const content = example ?? (Object.keys(parameterObject).length ? parameterObject : undefined);
  if (!bodyType.includes('json') || content === undefined) return { bodyType: 'none', bodyContent: '' };
  if (typeof content === 'string') {
    try {
      return { bodyType: 'json', bodyContent: JSON.stringify(JSON.parse(content), null, 2) };
    } catch {
      // 保留原始文本，让保存/执行阶段给出明确的 JSON 格式错误，而不是静默丢弃请求体。
      return { bodyType: 'json', bodyContent: content };
    }
  }
  return { bodyType: 'json', bodyContent: JSON.stringify(content, null, 2) };
};

const nativeExpectedStatus = (responses: unknown): number => {
  // 原生格式响应是数组，优先使用第一个明确的数字状态码。
  const responseList = Array.isArray(responses) ? responses : [];
  const code = responseList
    .map(asRecord)
    .map((response) => response?.code)
    .map(asString)
    .find((value) => value && /^\d{3}$/.test(value));
  return code ? Number(code) : 200;
};

const createApiCase = (
  moduleId: string,
  name: string,
  endpoint: string,
  method: HttpMethod,
  headers: ApiKeyValueItem[],
  queryParams: ApiKeyValueItem[],
  body: Pick<ApiAutomationCaseDetails, 'bodyType' | 'bodyContent'>,
  status: number,
): CreateTestCaseInput => ({
  type: 'api',
  moduleId,
  name,
  priority: 'P1',
  status: '维护中',
  endpoint,
  method,
  expectedStatus: status,
  apiDetails: {
    headers,
    queryParams,
    bodyType: body.bodyType,
    bodyContent: body.bodyContent,
    bodyFields: [],
    assertions: [{ type: 'statusCode', target: '', comparison: 'equals', expected: String(status) }],
    extracts: [],
  },
});

const parseNativeApifox = (document: JsonRecord, moduleId: string): CreateTestCaseInput[] => {
  // 递归遍历原生项目导出的目录树，收集每个目录项中的 `api` 定义。
  const cases: CreateTestCaseInput[] = [];
  const commonParameters = asRecord(asRecord(document.commonParameters)?.parameters);
  const commonHeaders = nativeKeyValues(commonParameters, 'header');
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = asRecord(value);
    if (!record) return;
    const api = asRecord(record.api);
    const method = asString(api?.method)?.toUpperCase() as HttpMethod | undefined;
    const endpoint = asString(api?.path);
    if (api && method && supportedMethods.includes(method) && endpoint) {
      const name = firstNonEmpty(record.name, api.name, api.operationId) ?? `${method} ${endpoint}`;
      const parameters = api.parameters;
      const body = nativeRequestBody(api.requestBody);
      cases.push(
        createApiCase(
          moduleId,
          name,
          replaceNativePathParameters(
            endpoint.startsWith('/') ? endpoint : `/${endpoint}`,
            api.parameters && asRecord(api.parameters)?.path,
          ),
          method,
          mergeNativeHeaders(commonHeaders, nativeKeyValues(parameters, 'header')),
          nativeKeyValues(parameters, 'query'),
          body,
          nativeExpectedStatus(api.responses),
        ),
      );
    }
    if (Array.isArray(record.items)) record.items.forEach(visit);
  };
  visit(document.apiCollection);
  if (!cases.length) throw new Error('导入文件中没有找到可导入的接口用例');
  return cases;
};

export function parseApifoxOpenApi(value: unknown, moduleId: string): CreateTestCaseInput[] {
  // 同时兼容 OpenAPI 文档与 Apifox 原生项目导出，避免把 apiCollection 误判为缺少 paths。
  const document = asRecord(value);
  if (document?.apiCollection) return parseNativeApifox(document, moduleId);
  const paths = asRecord(document?.paths);
  if (!paths) throw new Error('导入文件不是有效的 Apifox JSON（缺少 paths 或 apiCollection）');
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
      cases.push(createApiCase(moduleId, name, endpoint, method, headers, queryParams, body, status));
    });
  });
  if (!cases.length) throw new Error('导入文件中没有找到可导入的接口用例');
  return cases;
}
