"""静的ファイル配信の Cache-Control 設定。

アップロード画像 (/uploads/*) と Vite のビルド成果物 (/assets/*) は、
ファイル名に UUID / コンテンツハッシュが入っており、同じ URL の中身が
後から変わることがない (app/utils.py の save_upload_file、および
venue_maps.py の更新処理は常に新しい UUID 名で書き出す)。
したがって immutable として長期キャッシュして安全。

これが効くと、2回目以降の表示ではブラウザがそもそもリクエストを送らない。
StaticFiles は ETag / Last-Modified を返すので条件付き GET (304) にはなるが、
304 でも「ミドルウェア全段 + Azure Files への stat」のコストは発生する。
worker 1 プロセス構成ではこの往復自体を消すことに意味がある。
"""

from starlette.staticfiles import StaticFiles

# 内容が変わらない URL 向け。認証の内側にあるので private。
IMMUTABLE = "private, max-age=31536000, immutable"
# HTML はデプロイ後すぐ切り替わってほしいので毎回検証させる。
REVALIDATE = "no-cache"


def cache_control_for(path: str) -> str:
    """SPA の配信パスに対する Cache-Control を返す。"""
    # Vite はハッシュ付きファイル名を assets/ 配下に出力する
    if path.startswith("assets/"):
        return IMMUTABLE
    return REVALIDATE


class UploadStaticFiles(StaticFiles):
    """/uploads 配信用。すべて内容不変として長期キャッシュさせる。"""

    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        if response.status_code in (200, 304):
            response.headers["Cache-Control"] = IMMUTABLE
        return response
