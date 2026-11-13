from functools import lru_cache
from urllib.parse import quote_plus

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str
    environment: str

    postgres_db: str
    postgres_user: str
    postgres_password: str
    postgres_host: str
    postgres_port: int

    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        validation_alias=AliasChoices("CORS_ORIGINS", "CORS_ALLOWED_ORIGINS"),
    )

    jwt_secret_key: str
    jwt_access_token_expire_minutes: int
    jwt_refresh_token_expire_days: int
    cookie_secure: bool

    openrouter_api_key: str
    openrouter_model: str = "google/gemini-2.5-flash"

    gcp_service_account_credentials: str = ""
    gcs_images_bucket_name: str = ""
    receipts_image_folder: str = Field(
        default="receipts",
        validation_alias=AliasChoices("GCS_RECEIPTS_IMAGE_FOLDER", "RECEIPTS_IMAGE_FOLDER"),
    )
    group_profile_image_folder: str = Field(
        default="group-profiles",
        validation_alias=AliasChoices(
            "GCS_GROUP_PROFILE_IMAGE_FOLDER", "GROUP_PROFILE_IMAGE_FOLDER"
        ),
    )
    user_profile_image_folder: str = Field(
        default="user-profiles",
        validation_alias=AliasChoices("GCS_USER_PROFILE_IMAGE_FOLDER", "USER_PROFILE_IMAGE_FOLDER"),
    )

    authorized_users: str = Field(
        default="", validation_alias=AliasChoices("AUTHORIZED_USERS", "AUTHORIZED_EMAILS")
    )

    @property
    def database_url(self) -> str:
        user = quote_plus(self.postgres_user)
        password = quote_plus(self.postgres_password)
        return (
            f"postgresql+asyncpg://{user}:{password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def authorized_users_set(self) -> frozenset[str]:
        return frozenset(
            user.strip().lower()
            for user in self.authorized_users.split(",")
            if user.strip()
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
