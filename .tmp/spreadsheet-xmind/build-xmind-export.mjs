import fs from 'node:fs/promises';
import path from 'node:path';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const outputDir = '/Users/alin/test-platform/test-platform/outputs/20260810_xmind_export';
const workbook = Workbook.create();
const sheet = workbook.worksheets.add('XMind 导出');

sheet.showGridLines = false;
sheet.freezePanes.freezeRows(4);

const exportedAt = new Date('2026-08-10T16:30:00+08:00');
const cases = [
  {
    用例目录: '核心模块/鉴权',
    用例名称: '登录正向场景 1',
    需求ID: '',
    前置条件: '测试账号已准备',
    用例类型: '功能测试',
    用例状态: '草稿',
    用例等级: 'P1',
    创建人: '江珊',
    归属迭代: '',
    用例步骤: '1. 执行登录场景 1',
    预期结果: '1. 系统正确处理登录场景 1',
  },
  {
    用例目录: '核心模块/鉴权',
    用例名称: '登录异常场景 2',
    需求ID: '',
    前置条件: '测试账号已准备',
    用例类型: '功能测试',
    用例状态: '草稿',
    用例等级: 'P2',
    创建人: '江珊',
    归属迭代: '',
    用例步骤: '1. 执行登录场景 2',
    预期结果: '1. 系统正确处理登录场景 2',
  },
  {
    用例目录: '核心模块/鉴权',
    用例名称: '登录正向场景 3',
    需求ID: '',
    前置条件: '测试账号已准备',
    用例类型: '功能测试',
    用例状态: '草稿',
    用例等级: 'P2',
    创建人: '江珊',
    归属迭代: '',
    用例步骤: '1. 执行登录场景 3',
    预期结果: '1. 系统正确处理登录场景 3',
  },
  {
    用例目录: '核心模块/鉴权',
    用例名称: '登录异常场景 4',
    需求ID: '',
    前置条件: '测试账号已准备',
    用例类型: '功能测试',
    用例状态: '草稿',
    用例等级: 'P2',
    创建人: '江珊',
    归属迭代: '',
    用例步骤: '1. 执行登录场景 4',
    预期结果: '1. 系统正确处理登录场景 4',
  },
  {
    用例目录: '核心模块/鉴权',
    用例名称: '登录正向场景 5',
    需求ID: '',
    前置条件: '测试账号已准备',
    用例类型: '功能测试',
    用例状态: '草稿',
    用例等级: 'P2',
    创建人: '江珊',
    归属迭代: '',
    用例步骤: '1. 执行登录场景 5',
    预期结果: '1. 系统正确处理登录场景 5',
  },
  {
    用例目录: '核心模块/鉴权',
    用例名称: '登录异常场景 6',
    需求ID: '',
    前置条件: '测试账号已准备',
    用例类型: '功能测试',
    用例状态: '草稿',
    用例等级: 'P2',
    创建人: '江珊',
    归属迭代: '',
    用例步骤: '1. 执行登录场景 6',
    预期结果: '1. 系统正确处理登录场景 6',
  },
];

const headers = [
  '用例目录',
  '用例名称',
  '需求ID',
  '前置条件',
  '用例类型',
  '用例状态',
  '用例等级',
  '创建人',
  '归属迭代',
  '用例步骤',
  '预期结果',
];

sheet.getRange('A1:K1').merge();
sheet.getRange('A1').values = [['XMind 生成预览导出']];
sheet.getRange('A2').values = [['生成时间']];
sheet.getRange('B2').values = [[exportedAt]];
sheet.getRange('D2').values = [['用例条数']];
sheet.getRange('E2').formulas = [['=COUNTA(A5:A10)']];
sheet.getRange('A4:K4').values = [headers];
sheet.getRange('A5:K10').values = cases.map((item) => headers.map((header) => item[header]));

sheet.getRange('B2').setNumberFormat('yyyy-mm-dd hh:mm');
sheet.getRange('D2').format.font.bold = true;
sheet.getRange('A1:K1').format.font.bold = true;
sheet.getRange('A1:K1').format.font.size = 16;
sheet.getRange('A4:K4').format.font.bold = true;

sheet.getRange('A1:K1').format.borders = { preset: 'outside', style: 'thin', color: '#9EB5CC' };
sheet.getRange('A2:E2').format.borders = { preset: 'outside', style: 'thin', color: '#D6DFEA' };
sheet.getRange('A4:K10').format.borders = { preset: 'all', style: 'thin', color: '#D9E2F1' };

sheet.getRange('A1').format.rowHeightPx = 32;
sheet.getRange('A4').format.rowHeightPx = 26;

const widths = [
  ['A1', 168],
  ['B1', 155],
  ['C1', 88],
  ['D1', 150],
  ['E1', 95],
  ['F1', 95],
  ['G1', 92],
  ['H1', 100],
  ['I1', 95],
  ['J1', 188],
  ['K1', 208],
];
for (const [cell, width] of widths) {
  sheet.getRange(cell).format.columnWidthPx = width;
}

const inspect = await workbook.inspect({
  kind: 'table',
  range: 'A1:K10',
  include: 'values,formulas',
  tableMaxRows: 12,
  tableMaxCols: 12,
});
console.log(inspect.ndjson);

const formulaErrors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
  options: { useRegex: true, maxResults: 50 },
  summary: 'final formula error scan',
});
console.log(formulaErrors.ndjson);

const preview = await workbook.render({
  sheetName: 'XMind 导出',
  range: 'A1:K10',
  scale: 1,
  format: 'png',
  autoCrop: 'all',
});

await fs.mkdir(outputDir, { recursive: true });
const previewBytes = new Uint8Array(await preview.arrayBuffer());
await fs.writeFile(path.join(outputDir, 'preview.png'), previewBytes);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, 'output.xlsx'));

console.log(`Saved workbook to ${path.join(outputDir, 'output.xlsx')}`);
