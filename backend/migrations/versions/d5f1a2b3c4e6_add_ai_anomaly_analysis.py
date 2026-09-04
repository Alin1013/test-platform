"""增加 AI 异常分析记录表，保存脱敏输入、结构化结果与反馈。"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "d5f1a2b3c4e6"
down_revision: str | Sequence[str] | None = "c4e7a1b2d9f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """创建异常分析主表，并通过外键绑定用户生命周期。"""
    op.create_table(
        "ai_anomaly_analysis",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("source_id", sa.String(length=128), nullable=True),
        sa.Column("input_summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("input_content", sa.Text(), nullable=False, server_default=""),
        sa.Column("result_json", sa.Text(), nullable=True),
        sa.Column("model_name", sa.String(length=128), nullable=True),
        sa.Column("token_usage", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="COMPLETED"),
        sa.Column("error_message", sa.String(length=1000), nullable=True),
        sa.Column("helpful", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "source_type IN ('TEXT', 'LOG', 'SCREENSHOT', 'FILE', 'EXECUTION')",
            name="ck_ai_anomaly_analysis_source_type",
        ),
        sa.CheckConstraint(
            "status IN ('COMPLETED', 'FAILED')", name="ck_ai_anomaly_analysis_status"
        ),
        comment="AI 异常分析输入、结构化结果与反馈",
    )
    op.create_index("ix_ai_anomaly_analysis_project_id", "ai_anomaly_analysis", ["project_id"])
    op.create_index("ix_ai_anomaly_analysis_user_id", "ai_anomaly_analysis", ["user_id"])
    op.create_index("ix_ai_anomaly_analysis_source_type", "ai_anomaly_analysis", ["source_type"])
    op.create_index("ix_ai_anomaly_analysis_source_id", "ai_anomaly_analysis", ["source_id"])
    op.create_index("ix_ai_anomaly_analysis_status", "ai_anomaly_analysis", ["status"])


def downgrade() -> None:
    """删除异常分析表及其索引。"""
    op.drop_index("ix_ai_anomaly_analysis_status", table_name="ai_anomaly_analysis")
    op.drop_index("ix_ai_anomaly_analysis_source_id", table_name="ai_anomaly_analysis")
    op.drop_index("ix_ai_anomaly_analysis_source_type", table_name="ai_anomaly_analysis")
    op.drop_index("ix_ai_anomaly_analysis_user_id", table_name="ai_anomaly_analysis")
    op.drop_index("ix_ai_anomaly_analysis_project_id", table_name="ai_anomaly_analysis")
    op.drop_table("ai_anomaly_analysis")
