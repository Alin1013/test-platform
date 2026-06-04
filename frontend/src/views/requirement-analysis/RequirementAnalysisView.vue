<template>
  <div class="prd-case-page">
    <header class="page-title">
      <div>
        <h1>AI 用例生成</h1>
        <p>PRD 文件生成测试点，或从 XMind 测试点直接生成测试用例，确认无误后下载 Excel。</p>
      </div>
      <el-button v-if="currentTaskId" :icon="Refresh" @click="resetWorkspace">新任务</el-button>
    </header>

    <el-alert
      v-if="configWarning"
      :title="configWarning"
      type="warning"
      show-icon
      :closable="false"
      class="config-alert"
    />

    <section v-if="!currentTaskId" class="workspace-grid">
      <div class="panel upload-panel">
        <div class="panel-title">
          <h2>上传内容</h2>
          <span>支持 txt / md / pdf / docx / html / xmind / png / bmp / jpg</span>
        </div>

        <div
          class="dropzone"
          :class="{ active: dragOver }"
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop.prevent="handleSourceDrop"
        >
          <el-icon><Upload /></el-icon>
          <div class="dropzone-text">
            <strong>{{ sourceFile ? sourceFile.name : '选择或拖入 PRD 文件' }}</strong>
            <span v-if="sourceFile">{{ formatFileSize(sourceFile.size) }}</span>
            <span v-else>图片文件会调用视觉模型解析，XMind 会直接读取测试点</span>
          </div>
          <input
            ref="sourceInput"
            class="hidden-input"
            type="file"
            accept=".txt,.md,.pdf,.docx,.html,.htm,.xmind,.png,.bmp,.jpg,.jpeg"
            @change="onSourceFileChange"
          >
          <el-button :icon="Document" @click="$refs.sourceInput.click()">选择文件</el-button>
          <el-button v-if="sourceFile" :icon="Close" text @click="clearSourceFile">移除</el-button>
        </div>

        <div class="template-row">
          <div>
            <strong>{{ templateFile ? templateFile.name : '使用系统默认 Excel 模板' }}</strong>
            <span>{{ templateFile ? formatFileSize(templateFile.size) : '也可以上传本次任务专用模板' }}</span>
          </div>
          <input
            ref="templateInput"
            class="hidden-input"
            type="file"
            accept=".xlsx"
            @change="onTemplateFileChange"
          >
          <el-button :icon="FolderOpened" @click="$refs.templateInput.click()">选择模板</el-button>
          <el-button v-if="templateFile" text @click="clearTemplateFile">移除</el-button>
        </div>
      </div>

      <div class="panel form-panel">
        <div class="panel-title">
          <h2>任务信息</h2>
          <span>这些字段会写入最终 Excel 对应列</span>
        </div>

        <div class="form-grid">
          <label>
            <span>任务标题</span>
            <input v-model.trim="form.title" class="field" placeholder="例如：登录注册 PRD">
          </label>
          <label>
            <span>需求 ID</span>
            <input v-model.trim="form.requirementIds" class="field" placeholder="REQ-001, REQ-002">
          </label>
          <label>
            <span>用例类型</span>
            <input v-model.trim="form.caseType" class="field" placeholder="功能测试">
          </label>
          <label>
            <span>创建人</span>
            <input v-model.trim="form.caseCreator" class="field" placeholder="张三">
          </label>
          <label>
            <span>归属迭代</span>
            <input v-model.trim="form.iteration" class="field" placeholder="2026.06">
          </label>
          <label>
            <span>关联项目</span>
            <select v-model="form.project" class="field">
              <option value="">不关联项目</option>
              <option v-for="project in projects" :key="project.id" :value="project.id">
                {{ project.name }}
              </option>
            </select>
          </label>
        </div>

        <div class="submit-row">
          <el-button
            type="primary"
            :icon="MagicStick"
            :loading="creatingTask"
            :disabled="!canCreateTask"
            @click="createGenerationTask"
          >
            {{ createActionLabel }}
          </el-button>
        </div>
      </div>
    </section>

    <section v-else class="task-shell">
      <div class="panel task-status">
        <div class="task-meta">
          <div>
            <span>任务 ID</span>
            <strong>{{ currentTaskId }}</strong>
          </div>
          <div>
            <span>当前状态</span>
            <strong>{{ statusText }}</strong>
          </div>
          <div>
            <span>进度</span>
            <strong>{{ taskProgress }}%</strong>
          </div>
        </div>
        <el-steps :active="activeStep" finish-status="success" align-center>
          <el-step title="解析 PRD" />
          <el-step title="审核测试点" />
          <el-step title="生成用例" />
          <el-step title="审核导出" />
        </el-steps>
      </div>

      <div v-if="loadingStage" class="panel waiting-panel">
        <el-icon class="spin"><Refresh /></el-icon>
        <div>
          <strong>{{ statusText }}</strong>
          <span>后台正在处理，稍后会自动进入下一阶段。</span>
        </div>
      </div>

      <section v-if="testPoints.length" class="panel review-panel">
        <div class="review-header">
          <div>
            <h2>测试点审核</h2>
            <span>{{ reviewStatusLabel(testPointReviewStatus) }}</span>
          </div>
          <div class="review-actions">
            <el-button :icon="EditPen" @click="addTestPoint">新增测试点</el-button>
            <el-button :loading="savingPoints" @click="saveTestPoints">保存修改</el-button>
            <el-button
              type="primary"
              :icon="Check"
              :loading="approvingPoints"
              :disabled="testPointReviewStatus === 'approved'"
              @click="approveTestPoints"
            >
              审核完成并生成用例
            </el-button>
          </div>
        </div>

        <div class="ai-feedback">
          <textarea
            v-model.trim="pointRevisionMessage"
            rows="3"
            placeholder="输入审核意见，例如：补充验证码错误、网络异常、重复提交等场景"
          />
          <el-button
            :icon="MagicStick"
            :loading="revisingPoints"
            :disabled="!pointRevisionMessage || testPointReviewStatus === 'approved'"
            @click="reviseTestPoints"
          >
            AI 生成新版本
          </el-button>
        </div>

        <div class="point-list">
          <article v-for="(point, index) in testPoints" :key="point.localKey" class="editor-item">
            <button class="delete-icon" @click="removeTestPoint(index)">x</button>
            <div class="editor-grid">
              <label>
                <span>ID</span>
                <input v-model.trim="point.id" class="field compact">
              </label>
              <label class="wide">
                <span>标题</span>
                <input v-model.trim="point.title" class="field compact">
              </label>
              <label>
                <span>优先级</span>
                <input v-model.trim="point.priority" class="field compact">
              </label>
              <label>
                <span>覆盖类型</span>
                <input v-model.trim="point.coverage_type" class="field compact">
              </label>
              <label>
                <span>需求 ID</span>
                <input v-model.trim="point.requirement_ids_text" class="field compact">
              </label>
              <label>
                <span>测试对象</span>
                <input v-model.trim="point.test_object" class="field compact">
              </label>
            </div>
            <label class="block-editor">
              <span>前置条件</span>
              <textarea v-model="point.preconditions_text" rows="2" />
            </label>
            <label class="block-editor">
              <span>预期关注点</span>
              <textarea v-model="point.expected_focus" rows="2" />
            </label>
          </article>
        </div>
      </section>

      <section v-if="testCases.length" class="panel review-panel">
        <div class="review-header">
          <div>
            <h2>测试用例预览</h2>
            <span>{{ reviewStatusLabel(testCaseReviewStatus) }}</span>
          </div>
          <div class="review-actions">
            <el-button :icon="EditPen" @click="addTestCase">新增用例</el-button>
            <el-button :loading="savingCases" @click="saveTestCases">保存修改</el-button>
            <el-button
              type="primary"
              :icon="Check"
              :loading="approvingCases"
              :disabled="testCaseReviewStatus === 'approved'"
              @click="approveTestCases"
            >
              审核完成
            </el-button>
          </div>
        </div>

        <div class="ai-feedback">
          <textarea
            v-model.trim="caseRevisionMessage"
            rows="3"
            placeholder="输入审核意见，例如：补充支付失败、权限不足、边界值等用例"
          />
          <el-button
            :icon="MagicStick"
            :loading="revisingCases"
            :disabled="!caseRevisionMessage || testCaseReviewStatus === 'approved'"
            @click="reviseTestCases"
          >
            AI 生成新版本
          </el-button>
        </div>

        <div class="case-list">
          <article v-for="(testCase, index) in testCases" :key="testCase.localKey" class="editor-item">
            <button class="delete-icon" @click="removeTestCase(index)">x</button>
            <div class="editor-grid">
              <label>
                <span>ID</span>
                <input v-model.trim="testCase.id" class="field compact">
              </label>
              <label class="wide">
                <span>用例名称</span>
                <input v-model.trim="testCase.title" class="field compact">
              </label>
              <label>
                <span>目录</span>
                <input v-model.trim="testCase.catalog" class="field compact">
              </label>
              <label>
                <span>等级</span>
                <input v-model.trim="testCase.priority" class="field compact">
              </label>
              <label>
                <span>需求 ID</span>
                <input v-model.trim="testCase.requirement_ids_text" class="field compact">
              </label>
              <label>
                <span>用例类型</span>
                <input v-model.trim="testCase.case_type" class="field compact">
              </label>
            </div>
            <label class="block-editor">
              <span>前置条件</span>
              <textarea v-model="testCase.preconditions_text" rows="2" />
            </label>
            <label class="block-editor">
              <span>用例步骤</span>
              <textarea v-model="testCase.steps_text" rows="4" />
            </label>
            <label class="block-editor">
              <span>预期结果</span>
              <textarea v-model="testCase.expected_result" rows="2" />
            </label>
          </article>
        </div>
      </section>

      <div v-if="testCaseReviewStatus === 'approved'" class="panel download-panel">
        <div>
          <h2>Excel 已可下载</h2>
          <span>用例状态列保持空白，可在表格中继续维护。</span>
        </div>
        <div class="download-actions">
          <el-button type="success" :icon="Download" :loading="downloading" @click="downloadExcel">
            下载 Excel
          </el-button>
          <el-button @click="saveToRecords">保存到用例库</el-button>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import api from '@/utils/api'
import { ElMessage } from 'element-plus'
import {
  Check,
  Close,
  Document,
  Download,
  EditPen,
  FolderOpened,
  MagicStick,
  Refresh,
  Upload
} from '@element-plus/icons-vue'
import {
  approveGeneratedTestCases,
  approveGeneratedTestPoints,
  createTestCaseGenerationTask,
  exportGeneratedTestCases,
  getTestCaseGenerationProgress,
  reviseGeneratedTestCases,
  reviseGeneratedTestPoints,
  updateGeneratedTestCases,
  updateGeneratedTestPoints
} from '@/api/requirement-analysis'

export default {
  name: 'RequirementAnalysisView',
  data() {
    return {
      Check,
      Close,
      Document,
      Download,
      EditPen,
      FolderOpened,
      MagicStick,
      Refresh,
      Upload,
      projects: [],
      sourceFile: null,
      templateFile: null,
      dragOver: false,
      form: {
        title: '',
        requirementIds: '',
        caseType: '功能测试',
        caseCreator: '',
        iteration: '',
        project: ''
      },
      configWarning: '',
      creatingTask: false,
      currentTaskId: '',
      task: null,
      statusText: '待开始',
      taskProgress: 0,
      activeStep: 0,
      pollTimer: null,
      loadingStage: false,
      testPoints: [],
      testCases: [],
      testPointReviewStatus: 'pending',
      testCaseReviewStatus: 'pending',
      pointRevisionMessage: '',
      caseRevisionMessage: '',
      savingPoints: false,
      approvingPoints: false,
      revisingPoints: false,
      savingCases: false,
      approvingCases: false,
      revisingCases: false,
      downloading: false
    }
  },
  computed: {
    canCreateTask() {
      return Boolean(
        this.sourceFile &&
        this.form.title &&
        this.form.requirementIds &&
        this.form.caseType &&
        this.form.caseCreator &&
        this.form.iteration
      )
    },
    isXmindSource() {
      return Boolean(this.sourceFile && /\.xmind$/i.test(this.sourceFile.name))
    },
    createActionLabel() {
      return this.isXmindSource ? '生成测试用例' : '生成测试点'
    }
  },
  mounted() {
    this.loadProjects()
    this.checkConfigStatus()
  },
  beforeUnmount() {
    this.stopPolling()
  },
  methods: {
    async loadProjects() {
      try {
        const response = await api.get('/projects/')
        this.projects = response.data.results || response.data || []
      } catch (error) {
        console.error('加载项目失败', error)
      }
    },

    async checkConfigStatus() {
      try {
        const response = await api.get('/requirement-analysis/config/check/')
        const data = response.data
        const writerReady = data.writer_model?.configured && data.writer_model?.enabled
        const promptReady = data.writer_prompt?.configured && data.writer_prompt?.enabled
        this.configWarning = writerReady && promptReady ? '' : '请先配置并启用用例编写模型和用例编写提示词'
      } catch (error) {
        this.configWarning = ''
      }
    },

    onSourceFileChange(event) {
      const file = event.target.files?.[0]
      if (file) this.setSourceFile(file)
    },

    handleSourceDrop(event) {
      this.dragOver = false
      const file = event.dataTransfer.files?.[0]
      if (file) this.setSourceFile(file)
    },

    setSourceFile(file) {
      const allowed = /\.(txt|md|pdf|docx|html|htm|xmind|png|bmp|jpg|jpeg)$/i
      if (!allowed.test(file.name)) {
        ElMessage.error('不支持的 PRD 文件格式')
        return
      }
      this.sourceFile = file
      if (!this.form.title) {
        this.form.title = file.name.replace(/\.[^/.]+$/, '')
      }
    },

    clearSourceFile() {
      this.sourceFile = null
      if (this.$refs.sourceInput) this.$refs.sourceInput.value = ''
    },

    onTemplateFileChange(event) {
      const file = event.target.files?.[0]
      if (!file) return
      if (!/\.xlsx$/i.test(file.name)) {
        ElMessage.error('模板文件请使用 xlsx 格式')
        return
      }
      this.templateFile = file
    },

    clearTemplateFile() {
      this.templateFile = null
      if (this.$refs.templateInput) this.$refs.templateInput.value = ''
    },

    formatFileSize(size) {
      if (!size) return '0 B'
      const units = ['B', 'KB', 'MB', 'GB']
      let value = size
      let index = 0
      while (value >= 1024 && index < units.length - 1) {
        value /= 1024
        index += 1
      }
      return `${value.toFixed(index ? 1 : 0)} ${units[index]}`
    },

    async createGenerationTask() {
      if (!this.canCreateTask) {
        ElMessage.error('请补齐上传文件和任务信息')
        return
      }

      this.creatingTask = true
      try {
        const formData = new FormData()
        formData.append('title', this.form.title)
        formData.append('source_file', this.sourceFile)
        if (this.templateFile) formData.append('template_file', this.templateFile)
        formData.append('requirement_ids', this.form.requirementIds)
        formData.append('case_type', this.form.caseType)
        formData.append('case_creator', this.form.caseCreator)
        formData.append('iteration', this.form.iteration)
        formData.append('use_writer_model', 'true')
        formData.append('use_reviewer_model', 'false')
        if (this.form.project) formData.append('project', this.form.project)

        const response = await createTestCaseGenerationTask(formData)
        this.currentTaskId = response.data.task_id
        this.task = response.data.task
        this.statusText = '测试点生成中'
        if (this.isXmindSource) {
          this.statusText = '测试用例生成中'
        }
        this.taskProgress = 0
        this.activeStep = 1
        this.loadingStage = true
        ElMessage.success('任务已创建')
        this.startPolling()
      } catch (error) {
        ElMessage.error(`创建任务失败：${error.response?.data?.error || error.message}`)
      } finally {
        this.creatingTask = false
      }
    },

    startPolling() {
      this.stopPolling()
      this.fetchTaskProgress()
      this.pollTimer = setInterval(this.fetchTaskProgress, 3000)
    },

    stopPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
        this.pollTimer = null
      }
    },

    async fetchTaskProgress() {
      if (!this.currentTaskId) return
      try {
        const response = await getTestCaseGenerationProgress(this.currentTaskId)
        this.applyTaskState(response.data)
      } catch (error) {
        console.error('获取任务进度失败', error)
      }
    },

    applyTaskState(task) {
      this.task = task
      this.taskProgress = task.progress || 0
      this.testPointReviewStatus = task.test_points_review_status || 'pending'
      this.testCaseReviewStatus = task.test_cases_review_status || 'pending'
      this.activeStep = this.stepFromTask(task)
      this.statusText = this.statusFromTask(task)

      if (Array.isArray(task.test_points) && task.test_points.length) {
        this.testPoints = this.normalizePoints(task.test_points)
      }
      if (Array.isArray(task.test_cases_json) && task.test_cases_json.length) {
        this.testCases = this.normalizeCases(task.test_cases_json)
      }

      const stage = task.current_stage
      const readyForReview = stage === 'test_points_review' || stage === 'test_cases_review' || task.status === 'completed'
      this.loadingStage = !readyForReview && task.status !== 'failed'
      if (readyForReview || task.status === 'failed') this.stopPolling()
      if (task.status === 'failed') {
        ElMessage.error(task.error_message || '生成失败')
      }
    },

    stepFromTask(task) {
      if (task.current_stage === 'test_points_review') return 2
      if (task.current_stage === 'case_generation') return 3
      if (task.current_stage === 'test_cases_review' || task.status === 'completed') return 4
      return 1
    },

    statusFromTask(task) {
      if (task.status === 'failed') return '生成失败'
      if (task.current_stage === 'test_points_review') return '测试点待审核'
      if (task.current_stage === 'case_generation') return '测试用例生成中'
      if (task.current_stage === 'test_cases_review') return '测试用例待审核'
      if (task.status === 'completed') return '审核完成'
      if (task.status === 'generating') return 'AI 生成中'
      return '处理中'
    },

    reviewStatusLabel(status) {
      const labels = {
        pending: '待审核',
        revision_requested: '已修改待确认',
        approved: '已审核'
      }
      return labels[status] || '待审核'
    },

    splitText(value) {
      if (!value) return []
      if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean)
      return String(value).replace(/；/g, ',').replace(/;/g, ',').split(/,|\n/).map(item => item.trim()).filter(Boolean)
    },

    renderText(value) {
      if (!value) return ''
      return Array.isArray(value) ? value.join('\n') : String(value)
    },

    normalizePoints(points) {
      return points.map((point, index) => ({
        ...point,
        localKey: point.localKey || `${point.id || 'TP'}-${index}-${Date.now()}`,
        requirement_ids_text: this.renderText(point.requirement_ids),
        preconditions_text: this.renderText(point.preconditions),
        expected_focus: point.expected_focus || '',
        coverage_type: point.coverage_type || '',
        priority: point.priority || ''
      }))
    },

    serializePoints() {
      return this.testPoints.map(({ localKey, requirement_ids_text, preconditions_text, ...point }) => ({
        ...point,
        requirement_ids: this.splitText(requirement_ids_text),
        preconditions: this.splitText(preconditions_text),
        review_status: point.review_status || 'pending',
        review_comment: point.review_comment || ''
      }))
    },

    normalizeCases(cases) {
      return cases.map((testCase, index) => ({
        ...testCase,
        localKey: testCase.localKey || `${testCase.id || 'TC'}-${index}-${Date.now()}`,
        requirement_ids_text: this.renderText(testCase.requirement_ids),
        preconditions_text: this.renderText(testCase.preconditions),
        steps_text: this.renderSteps(testCase.steps),
        expected_result: testCase.expected_result || '',
        priority: testCase.priority || '',
        case_type: testCase.case_type || this.form.caseType
      }))
    },

    serializeCases() {
      return this.testCases.map(({ localKey, requirement_ids_text, preconditions_text, steps_text, ...testCase }) => ({
        ...testCase,
        requirement_ids: this.splitText(requirement_ids_text),
        preconditions: this.splitText(preconditions_text),
        steps: this.parseSteps(steps_text),
        review_status: testCase.review_status || 'pending',
        review_comment: testCase.review_comment || ''
      }))
    },

    renderSteps(steps) {
      if (!steps) return ''
      if (!Array.isArray(steps)) return String(steps)
      return steps.map((step, index) => {
        if (typeof step === 'object' && step !== null) {
          const expected = step.expected ? `\n   预期：${step.expected}` : ''
          return `${step.index || index + 1}. ${step.action || ''}${expected}`
        }
        return `${index + 1}. ${step}`
      }).join('\n')
    },

    parseSteps(text) {
      const steps = []
      String(text || '').split('\n').forEach(line => {
        const value = line.trim()
        if (!value) return
        if (/^(预期|期望)[:：]/.test(value) && steps.length) {
          steps[steps.length - 1].expected = value.replace(/^(预期|期望)[:：]\s*/, '')
          return
        }
        steps.push({
          index: steps.length + 1,
          action: value.replace(/^\d+[\.\)、]\s*/, ''),
          expected: ''
        })
      })
      return steps
    },

    addTestPoint() {
      this.testPoints.push({
        localKey: `new-point-${Date.now()}`,
        id: `TP-${String(this.testPoints.length + 1).padStart(3, '0')}`,
        title: '',
        requirement_ids_text: this.form.requirementIds,
        test_object: '',
        coverage_type: '',
        priority: 'P1',
        preconditions_text: '',
        expected_focus: '',
        review_status: 'pending',
        review_comment: ''
      })
    },

    removeTestPoint(index) {
      this.testPoints.splice(index, 1)
    },

    async saveTestPoints() {
      this.savingPoints = true
      try {
        const response = await updateGeneratedTestPoints(this.currentTaskId, this.serializePoints())
        this.testPoints = this.normalizePoints(response.data.test_points || [])
        this.testPointReviewStatus = 'revision_requested'
        ElMessage.success('测试点已保存')
      } catch (error) {
        ElMessage.error(`保存失败：${error.response?.data?.error || error.message}`)
      } finally {
        this.savingPoints = false
      }
    },

    async reviseTestPoints() {
      this.revisingPoints = true
      try {
        await updateGeneratedTestPoints(this.currentTaskId, this.serializePoints())
        const response = await reviseGeneratedTestPoints(this.currentTaskId, this.pointRevisionMessage)
        this.testPoints = this.normalizePoints(response.data.test_points || [])
        this.testPointReviewStatus = 'revision_requested'
        this.pointRevisionMessage = ''
        ElMessage.success('AI 已生成测试点新版本')
      } catch (error) {
        ElMessage.error(`修订失败：${error.response?.data?.error || error.message}`)
      } finally {
        this.revisingPoints = false
      }
    },

    async approveTestPoints() {
      this.approvingPoints = true
      try {
        await updateGeneratedTestPoints(this.currentTaskId, this.serializePoints())
        await approveGeneratedTestPoints(this.currentTaskId)
        this.testPointReviewStatus = 'approved'
        this.statusText = '测试用例生成中'
        this.activeStep = 3
        this.loadingStage = true
        ElMessage.success('测试点审核完成')
        this.startPolling()
      } catch (error) {
        ElMessage.error(`审核失败：${error.response?.data?.error || error.message}`)
      } finally {
        this.approvingPoints = false
      }
    },

    addTestCase() {
      this.testCases.push({
        localKey: `new-case-${Date.now()}`,
        id: `TC-${String(this.testCases.length + 1).padStart(3, '0')}`,
        title: '',
        catalog: '',
        priority: 'P1',
        requirement_ids_text: this.form.requirementIds,
        case_type: this.form.caseType,
        preconditions_text: '',
        steps_text: '',
        expected_result: '',
        review_status: 'pending',
        review_comment: ''
      })
    },

    removeTestCase(index) {
      this.testCases.splice(index, 1)
    },

    async saveTestCases() {
      this.savingCases = true
      try {
        const response = await updateGeneratedTestCases(this.currentTaskId, this.serializeCases())
        this.testCases = this.normalizeCases(response.data.test_cases || [])
        this.testCaseReviewStatus = 'revision_requested'
        ElMessage.success('测试用例已保存')
      } catch (error) {
        ElMessage.error(`保存失败：${error.response?.data?.error || error.message}`)
      } finally {
        this.savingCases = false
      }
    },

    async reviseTestCases() {
      this.revisingCases = true
      try {
        await updateGeneratedTestCases(this.currentTaskId, this.serializeCases())
        const response = await reviseGeneratedTestCases(this.currentTaskId, this.caseRevisionMessage)
        this.testCases = this.normalizeCases(response.data.test_cases || [])
        this.testCaseReviewStatus = 'revision_requested'
        this.caseRevisionMessage = ''
        ElMessage.success('AI 已生成用例新版本')
      } catch (error) {
        ElMessage.error(`修订失败：${error.response?.data?.error || error.message}`)
      } finally {
        this.revisingCases = false
      }
    },

    async approveTestCases() {
      this.approvingCases = true
      try {
        await updateGeneratedTestCases(this.currentTaskId, this.serializeCases())
        await approveGeneratedTestCases(this.currentTaskId)
        const response = await getTestCaseGenerationProgress(this.currentTaskId)
        this.applyTaskState(response.data)
        this.testCaseReviewStatus = 'approved'
        this.loadingStage = false
        ElMessage.success('测试用例审核完成')
      } catch (error) {
        ElMessage.error(`审核失败：${error.response?.data?.error || error.message}`)
      } finally {
        this.approvingCases = false
      }
    },

    async downloadExcel() {
      this.downloading = true
      try {
        const response = await exportGeneratedTestCases(this.currentTaskId)
        const blob = new Blob([response.data], {
          type: response.headers['content-type'] || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        })
        const filename = this.extractFilename(response.headers['content-disposition']) || `${this.currentTaskId}_testcases.xlsx`
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
        ElMessage.success('下载已开始')
      } catch (error) {
        ElMessage.error(`下载失败：${error.response?.data?.error || error.message}`)
      } finally {
        this.downloading = false
      }
    },

    extractFilename(disposition) {
      if (!disposition) return ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      return match ? decodeURIComponent(match[1]) : ''
    },

    async saveToRecords() {
      try {
        const response = await api.post(`/requirement-analysis/testcase-generation/${this.currentTaskId}/save_to_records/`)
        if (response.data.already_saved) {
          ElMessage.info('已保存到用例库')
        } else {
          ElMessage.success(`已导入 ${response.data.imported_count || 0} 条用例`)
        }
      } catch (error) {
        ElMessage.error(`保存失败：${error.response?.data?.error || error.message}`)
      }
    },

    resetWorkspace() {
      this.stopPolling()
      this.currentTaskId = ''
      this.task = null
      this.statusText = '待开始'
      this.taskProgress = 0
      this.activeStep = 0
      this.loadingStage = false
      this.testPoints = []
      this.testCases = []
      this.testPointReviewStatus = 'pending'
      this.testCaseReviewStatus = 'pending'
      this.pointRevisionMessage = ''
      this.caseRevisionMessage = ''
    }
  }
}
</script>

<style scoped>
.prd-case-page {
  min-height: 100%;
  padding: 24px;
  background: #f5f7fb;
  color: #1f2937;
}

.page-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.page-title h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
}

.page-title p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 14px;
}

.config-alert {
  margin-bottom: 16px;
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(320px, 0.95fr) minmax(420px, 1.05fr);
  gap: 16px;
}

.panel {
  background: #fff;
  border: 1px solid #dfe5ef;
  border-radius: 8px;
  padding: 18px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.panel-title,
.review-header,
.download-panel {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.panel-title h2,
.review-header h2,
.download-panel h2 {
  margin: 0;
  font-size: 18px;
}

.panel-title span,
.review-header span,
.download-panel span,
.template-row span,
.task-meta span,
.waiting-panel span {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-size: 13px;
}

.dropzone {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 14px;
  min-height: 132px;
  margin-top: 16px;
  padding: 18px;
  border: 1px dashed #94a3b8;
  border-radius: 8px;
  background: #f8fafc;
}

.dropzone.active {
  border-color: #2563eb;
  background: #eff6ff;
}

.dropzone .el-icon {
  font-size: 30px;
  color: #2563eb;
}

.dropzone-text strong,
.template-row strong {
  display: block;
  color: #111827;
  font-size: 15px;
}

.hidden-input {
  display: none;
}

.template-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.form-grid,
.editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}

label span {
  display: block;
  margin-bottom: 6px;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
}

.field,
.block-editor textarea,
.ai-feedback textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #111827;
  font-size: 14px;
  outline: none;
}

.field {
  height: 36px;
  padding: 0 10px;
}

.field.compact {
  height: 32px;
}

.field:focus,
.block-editor textarea:focus,
.ai-feedback textarea:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}

.submit-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}

.task-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.task-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.task-meta div {
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}

.task-meta strong {
  display: block;
  margin-top: 4px;
  font-size: 16px;
}

.waiting-panel {
  display: flex;
  align-items: center;
  gap: 14px;
}

.spin {
  color: #2563eb;
  font-size: 24px;
  animation: spin 1s linear infinite;
}

.review-actions,
.download-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.ai-feedback {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: stretch;
  margin-top: 16px;
}

.ai-feedback textarea,
.block-editor textarea {
  padding: 10px;
  resize: vertical;
}

.point-list,
.case-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

.editor-item {
  position: relative;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 14px;
  background: #fbfdff;
}

.editor-grid .wide {
  grid-column: span 2;
}

.block-editor {
  display: block;
  margin-top: 12px;
}

.delete-icon {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: #fee2e2;
  color: #991b1b;
  cursor: pointer;
}

.download-panel {
  align-items: center;
  border-color: #bbf7d0;
  background: #f0fdf4;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 980px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .dropzone {
    grid-template-columns: auto 1fr;
  }

  .task-meta,
  .form-grid,
  .editor-grid {
    grid-template-columns: 1fr;
  }

  .editor-grid .wide {
    grid-column: span 1;
  }

  .ai-feedback {
    grid-template-columns: 1fr;
  }

  .panel-title,
  .review-header,
  .download-panel,
  .page-title {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
