"""archive item 테이블 생성."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260819_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "items",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("source_method", sa.Text(), nullable=False),
        sa.Column("external_id", sa.Text()),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text()),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("source_item_url", sa.Text()),
        sa.Column("dedup_key", sa.Text(), nullable=False),
        sa.Column("author", sa.Text()),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("score", sa.Integer()),
        sa.Column("comments_count", sa.Integer()),
        sa.Column("rank", sa.Integer()),
        sa.Column("item_type", sa.Text()),
        sa.Column("tags_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("raw_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("source", "dedup_key", name="uq_items_source_dedup_key"),
    )
    op.create_index("ix_items_source_published_at", "items", ["source", sa.text("published_at DESC")])
    op.create_index("ix_items_last_seen_at", "items", [sa.text("last_seen_at DESC")])


def downgrade() -> None:
    op.drop_table("items")
