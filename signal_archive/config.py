"""Application settings loaded from the five PostgreSQL environment variables."""

from __future__ import annotations

from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    host: Annotated[str, Field(min_length=1)] = Field(validation_alias="POSTGRES_HOST")
    port: Annotated[int, Field(ge=1, le=65535)] = Field(validation_alias="POSTGRES_PORT")
    database: Annotated[str, Field(min_length=1)] = Field(validation_alias="POSTGRES_DB")
    user: Annotated[str, Field(min_length=1)] = Field(validation_alias="POSTGRES_USER")
    password: Annotated[str, Field(min_length=1)] = Field(validation_alias="POSTGRES_PASSWORD")

    @field_validator("host", "database", "user", "password", mode="before")
    @classmethod
    def strip_strings(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("port", mode="before")
    @classmethod
    def strip_port(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    def connection_kwargs(self) -> dict[str, str | int]:
        return {
            "host": self.host,
            "port": self.port,
            "dbname": self.database,
            "user": self.user,
            "password": self.password,
        }
