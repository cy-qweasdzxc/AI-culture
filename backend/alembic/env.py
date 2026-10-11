from logging.config import fileConfig

from alembic import context
from app.core.config import get_settings
from app.core.database import Base, make_engine
from app.models import entities  # noqa: F401

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata
url = get_settings().database_url


def include_object(obj, name, kind, reflected, compare_to):
    # Native vector table is intentionally managed by explicit dialect migration.
    return not (kind == "table" and name == "knowledge_vectors")


def run_migrations_offline():
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, dialect_opts={"paramstyle": "named"}, include_object=include_object)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    external_connection = config.attributes.get("connection")
    if external_connection is not None:
        context.configure(connection=external_connection, target_metadata=target_metadata, compare_type=True, include_object=include_object)
        with context.begin_transaction():
            context.run_migrations()
        return
    connectable = make_engine(url)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True, include_object=include_object)
        with context.begin_transaction():
            context.run_migrations()
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
