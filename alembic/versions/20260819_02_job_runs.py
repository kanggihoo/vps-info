"""Create collector execution history."""

from alembic import op
import sqlalchemy as sa


revision = "20260819_02"
down_revision = "20260819_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "job_run",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("parent_run_id", sa.BigInteger(), sa.ForeignKey("job_run.id")),
        sa.Column("job_key", sa.Text(), nullable=False),
        sa.Column("triggered_by", sa.Text(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("fetched_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("inserted_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_type", sa.Text()),
        sa.Column("error_message", sa.Text()),
        sa.CheckConstraint("status IN ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED')", name="ck_job_run_status"),
    )
    op.create_index("ix_job_run_parent_started_at", "job_run", ["parent_run_id", sa.text("started_at DESC")])


def downgrade() -> None:
    op.drop_table("job_run")
