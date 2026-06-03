/**
 * 需求分析模块相关 API
 */
import request from '@/utils/api'

// ==================== 生成行为配置 ====================

// 获取所有生成行为配置
export function getGenerationConfigs(params) {
  return request({
    url: '/requirement-analysis/generation-config/',
    method: 'get',
    params
  })
}

// 获取生成行为配置详情
export function getGenerationConfigDetail(id) {
  return request({
    url: `/requirement-analysis/generation-config/${id}/`,
    method: 'get'
  })
}

// 创建生成行为配置
export function createGenerationConfig(data) {
  return request({
    url: '/requirement-analysis/generation-config/',
    method: 'post',
    data
  })
}

// 更新生成行为配置
export function updateGenerationConfig(id, data) {
  return request({
    url: `/requirement-analysis/generation-config/${id}/`,
    method: 'put',
    data
  })
}

// 删除生成行为配置
export function deleteGenerationConfig(id) {
  return request({
    url: `/requirement-analysis/generation-config/${id}/`,
    method: 'delete'
  })
}

// 获取活跃的生成行为配置
export function getActiveGenerationConfig() {
  return request({
    url: '/requirement-analysis/generation-config/active/',
    method: 'get'
  })
}

// ==================== AI 模型配置 ====================

// 获取所有 AI 模型配置
export function getAIModelConfigs(params) {
  return request({
    url: '/requirement-analysis/ai-models/',
    method: 'get',
    params
  })
}

// 获取活跃的 AI 模型配置
export function getActiveAIModelConfig(modelType, role) {
  return request({
    url: '/requirement-analysis/ai-models/active/',
    method: 'get',
    params: { model_type: modelType, role }
  })
}

// 创建 AI 模型配置
export function createAIModelConfig(data) {
  return request({
    url: '/requirement-analysis/ai-models/',
    method: 'post',
    data
  })
}

// 更新 AI 模型配置
export function updateAIModelConfig(id, data) {
  return request({
    url: `/requirement-analysis/ai-models/${id}/`,
    method: 'put',
    data
  })
}

// 删除 AI 模型配置
export function deleteAIModelConfig(id) {
  return request({
    url: `/requirement-analysis/ai-models/${id}/`,
    method: 'delete'
  })
}

// ==================== 提示词配置 ====================

// 获取所有提示词配置
export function getPromptConfigs(params) {
  return request({
    url: '/requirement-analysis/prompts/',
    method: 'get',
    params
  })
}

// 获取活跃的提示词配置
export function getActivePromptConfig(promptType) {
  return request({
    url: '/requirement-analysis/prompts/active/',
    method: 'get',
    params: { prompt_type: promptType }
  })
}

// 创建提示词配置
export function createPromptConfig(data) {
  return request({
    url: '/requirement-analysis/prompts/',
    method: 'post',
    data
  })
}

// 更新提示词配置
export function updatePromptConfig(id, data) {
  return request({
    url: `/requirement-analysis/prompts/${id}/`,
    method: 'put',
    data
  })
}

// 删除提示词配置
export function deletePromptConfig(id) {
  return request({
    url: `/requirement-analysis/prompts/${id}/`,
    method: 'delete'
  })
}

// ==================== PRD2Case 分阶段生成 ====================

export function createTestCaseGenerationTask(data) {
  return request({
    url: '/requirement-analysis/testcase-generation/generate/',
    method: 'post',
    data
  })
}

export function getTestCaseGenerationProgress(taskId) {
  return request({
    url: `/requirement-analysis/testcase-generation/${taskId}/progress/`,
    method: 'get'
  })
}

export function updateGeneratedTestPoints(taskId, testPoints) {
  return request({
    url: `/requirement-analysis/testcase-generation/${taskId}/test_points/`,
    method: 'patch',
    data: { test_points: testPoints }
  })
}

export function reviseGeneratedTestPoints(taskId, message) {
  return request({
    url: `/requirement-analysis/testcase-generation/${taskId}/revise_test_points/`,
    method: 'post',
    data: { message }
  })
}

export function approveGeneratedTestPoints(taskId) {
  return request({
    url: `/requirement-analysis/testcase-generation/${taskId}/approve_test_points/`,
    method: 'post'
  })
}

export function updateGeneratedTestCases(taskId, testCases) {
  return request({
    url: `/requirement-analysis/testcase-generation/${taskId}/test_cases/`,
    method: 'patch',
    data: { test_cases: testCases }
  })
}

export function reviseGeneratedTestCases(taskId, message) {
  return request({
    url: `/requirement-analysis/testcase-generation/${taskId}/revise_test_cases/`,
    method: 'post',
    data: { message }
  })
}

export function approveGeneratedTestCases(taskId) {
  return request({
    url: `/requirement-analysis/testcase-generation/${taskId}/approve_test_cases/`,
    method: 'post'
  })
}

export function getActiveTestCaseTemplate() {
  return request({
    url: '/requirement-analysis/testcase-template/active/',
    method: 'get'
  })
}

export function createTestCaseTemplateConfig(data) {
  return request({
    url: '/requirement-analysis/testcase-template/',
    method: 'post',
    data
  })
}

export function exportGeneratedTestCases(taskId) {
  return request({
    url: `/requirement-analysis/testcase-generation/${taskId}/export_excel/`,
    method: 'get',
    responseType: 'blob'
  })
}
