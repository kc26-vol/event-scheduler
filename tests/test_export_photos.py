"""Excel 出力に埋め込む写真の形式変換のテスト。

本番 (Python 3.11) の mimetypes には .webp が無く、webp をそのまま埋め込むと
openpyxl の保存時に KeyError('.webp') で Excel 出力全体が 500 になっていた。
手元の Python 3.13 には .webp があるため、テストでは mimetypes から
webp を外して本番と同じ条件を作る。
"""

import io
import zipfile

import pytest
from openpyxl import Workbook
from openpyxl.packaging import manifest
from PIL import Image as PILImage

from app.config import UPLOAD_DIR
from app.routers.export import _add_photo


@pytest.fixture
def mimetypes_なし_webp():
    """.webp を知らない mimetypes (= 本番の Python 3.11) を再現する"""
    removed = {}
    for strict in (True, False):
        removed[strict] = manifest.mimetypes.types_map[strict].pop(".webp", None)
    yield
    for strict, mime in removed.items():
        if mime is not None:
            manifest.mimetypes.types_map[strict][".webp"] = mime


def _put_image(name: str, fmt: str, mode: str = "RGB", color="red") -> str:
    """UPLOAD_DIR に画像を置き、DB に入る URL パスを返す"""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    PILImage.new(mode, (40, 40), color).save(UPLOAD_DIR / name, format=fmt)
    return f"/uploads/{name}"


def _save_with_photo(photo_path: str) -> zipfile.ZipFile:
    """写真を1枚埋め込んだブックを保存し、xlsx (zip) を返す"""
    wb = Workbook()
    ws = wb.active
    ws.append(["", ""])
    _add_photo(ws, photo_path, col=2, row=1)
    stream = io.BytesIO()
    wb.save(stream)  # ここが KeyError('.webp') で落ちていた
    stream.seek(0)
    return zipfile.ZipFile(stream)


def _saved_media(photo_path: str) -> list[str]:
    """埋め込まれた画像のアーカイブ内ファイル名を返す"""
    return [n for n in _save_with_photo(photo_path).namelist() if n.startswith("xl/media/")]


def test_webp写真でも保存できてPNGとして埋め込まれる(mimetypes_なし_webp):
    path = _put_image("photo_test.webp", "WEBP")
    assert _saved_media(path) == ["xl/media/image1.png"]


def test_透過webpはアルファを保ったまま埋め込まれる(mimetypes_なし_webp):
    # 完全不透過だと PIL は webp を RGB として読み直すので、半透明にしておく
    path = _put_image("photo_alpha.webp", "WEBP", mode="RGBA", color=(255, 0, 0, 128))
    z = _save_with_photo(path)
    embedded = PILImage.open(io.BytesIO(z.read("xl/media/image1.png")))
    assert embedded.mode == "RGBA"


@pytest.mark.parametrize("name,fmt,ext", [
    ("photo_test.png", "PNG", "png"),
    ("photo_test.jpg", "JPEG", "jpeg"),
    ("photo_test.gif", "GIF", "gif"),
])
def test_元から扱える形式は変換せずそのまま埋め込む(name, fmt, ext):
    path = _put_image(name, fmt)
    assert _saved_media(path) == [f"xl/media/image1.{ext}"]


def test_拡張子が中身と違っても実際の形式で判定する(mimetypes_なし_webp):
    """アップロード時のファイル名は中身と一致している保証がない"""
    path = _put_image("photo_liar.png", "WEBP")  # 中身は webp、名前は .png
    assert _saved_media(path) == ["xl/media/image1.png"]


def test_壊れた画像は写真を飛ばして出力を続ける():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / "photo_broken.webp").write_bytes(b"not an image")
    assert _saved_media("/uploads/photo_broken.webp") == []


def test_ファイルが無くても出力を続ける():
    assert _saved_media("/uploads/photo_missing.webp") == []
