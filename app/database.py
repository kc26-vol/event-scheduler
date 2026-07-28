from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from .config import DATABASE_URL

# 複数 worker からの同時アクセスは SQLite 自身のファイルロックに任せる。
#
# アプリ側でプロセス間ロックを掛ける案も試したが、この構成では成立しなかった。
# FastAPI の `Depends(get_db)` はセッションの後片付け (db.close()) を
# イベントループ経由でスケジュールする。一方 async なエンドポイントや
# AuthMiddleware はイベントループ上で直接 DB を触る。前者がロックを持ったまま
# 後片付け待ちになり、後者がそのロックを待ってイベントループを止めると、
# 互いに進めなくなる (実測: 3 worker で並行書き込みすると即座に停止した)。
#
# SQLite のロックは元々マルチプロセス前提の仕組みで、全 worker が同一
# コンテナ = 同一ホストにいる限り想定内の使い方になる。
# (SQLite が「ネットワークFSでは当てにならない」としているのは、主に
#  別ホストのプロセス間で協調する場合の話。)
#
# 競合時に即エラーにせず待たせるため、busy timeout を伸ばしておく。
# pysqlite の既定は 5 秒で、Azure Files 越しだと不足しうる。
BUSY_TIMEOUT_SECONDS = 30.0

engine = create_engine(
    DATABASE_URL,
    connect_args={
        "check_same_thread": False,
        "timeout": BUSY_TIMEOUT_SECONDS,
    },
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
