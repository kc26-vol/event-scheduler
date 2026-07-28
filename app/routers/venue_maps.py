from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import VenueMap
from ..schemas import VenueMapResponse
from ..utils import read_upload, store_upload, remove_upload

router = APIRouter(prefix="/api/venue-maps", tags=["venue-maps"])


@router.get("/", response_model=list[VenueMapResponse])
def list_venue_maps(db: Session = Depends(get_db)):
    return db.query(VenueMap).order_by(VenueMap.order).all()


@router.post("/", response_model=VenueMapResponse, status_code=201)
async def create_venue_map(
    title: str = Form(...),
    order: int = Form(0),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # DB に触る前にアップロードを読み切り、新ファイルを書いておく。
    content, ext = await read_upload(image)
    image_path = store_upload(content, ext, prefix="map_")

    venue_map = VenueMap(title=title, image=image_path, order=order)
    db.add(venue_map)
    db.commit()
    db.refresh(venue_map)
    return venue_map


@router.put("/{map_id}", response_model=VenueMapResponse)
async def update_venue_map(
    map_id: int,
    title: str = Form(...),
    order: int = Form(0),
    image: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    new_image = ""
    if image and image.filename:
        content, ext = await read_upload(image)
        new_image = store_upload(content, ext, prefix="map_")

    venue_map = db.query(VenueMap).filter(VenueMap.id == map_id).first()
    if not venue_map:
        remove_upload(new_image)
        raise HTTPException(status_code=404, detail="VenueMap not found")

    venue_map.title = title
    venue_map.order = order

    old_image = ""
    if new_image:
        old_image = venue_map.image
        venue_map.image = new_image

    db.commit()
    db.refresh(venue_map)

    # 古い画像の削除は DB 更新が確定してから。
    remove_upload(old_image)
    return venue_map


@router.delete("/{map_id}", status_code=204)
def delete_venue_map(map_id: int, db: Session = Depends(get_db)):
    venue_map = db.query(VenueMap).filter(VenueMap.id == map_id).first()
    if not venue_map:
        raise HTTPException(status_code=404, detail="VenueMap not found")
    image = venue_map.image
    db.delete(venue_map)
    db.commit()
    remove_upload(image)
