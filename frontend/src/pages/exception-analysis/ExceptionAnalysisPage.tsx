/**
 * 异常分析页：为执行失败、异常请求与失败证据提供统一的访问入口。
 * 当前先展示空态，后续分析能力可以在此页面扩展而不改变主导航结构。
 */
import { Empty } from 'antd';
import { PageHeader } from '../../components/PageHeader';

export function ExceptionAnalysisPage() {
  // 保留独立页面和稳定标题，便于后续接入异常数据时复用导航深链。
  return (
    <section className="page-section">
      <PageHeader title="异常分析" description="集中查看执行失败与异常请求，快速定位测试问题" />
      <div className="placeholder-panel" aria-label="异常分析空态">
        <Empty description="暂无异常分析数据" />
      </div>
    </section>
  );
}
