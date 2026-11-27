"""
Cloudflare R2 Storage and Presigned Upload URL Endpoints.
"""

from fastapi import APIRouter, Depends, status

from app.api.deps import get_current_user
from app.core.exceptions import BadRequestError, PermissionDeniedError
from app.schemas.common import StandardResponse
from app.schemas.storage import (
    PresignedDownloadRequest,
    PresignedDownloadResponse,
    PresignedUploadRequest,
    PresignedUploadResponse,
)
from app.schemas.user import CurrentUser
from app.services.storage_service import StorageService

router = APIRouter(prefix="/storage", tags=["Storage & Media"])


@router.post(
    "/presigned-upload",
    response_model=StandardResponse[PresignedUploadResponse],
    status_code=status.HTTP_200_OK,
)
async def generate_presigned_upload_url(
    request: PresignedUploadRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Generate single-use S3/Cloudflare R2 PUT presigned upload URL.
    Enforces strict MIME whitelist (PDF, PNG, JPG) and 5MB maximum file size.
    """
    response = StorageService.generate_presigned_upload_url(
        request=request,
        user_id=current_user.id,
    )
    return StandardResponse[PresignedUploadResponse](
        success=True,
        message="Presigned upload URL generated successfully",
        data=response,
    )


@router.post(
    "/presign-download",
    response_model=StandardResponse[PresignedDownloadResponse],
    status_code=status.HTTP_200_OK,
)
async def generate_presigned_download_url(
    request: PresignedDownloadRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Generate ephemeral 5-minute presigned GET URL for private documents (KYC, tickets).
    Strictly restricted to document owner prefix or admins with KYC verification permission.
    """
    clean_key = request.key.strip().lstrip("/")
    if ".." in clean_key or clean_key.startswith("http"):
        raise BadRequestError("Invalid storage object key")

    has_kyc_admin_access = current_user.is_active_admin and (
        current_user.has_admin_permission("users.verify_kyc")
        or current_user.has_admin_permission("agencies.verify")
    )
    is_owner_key = str(current_user.id) in clean_key.split("/")

    if not (has_kyc_admin_access or is_owner_key):
        raise PermissionDeniedError(
            "Insufficient permission to inspect or download protected storage object"
        )

    signed_url = StorageService.generate_presigned_download_url(clean_key, expires_in=300)
    return StandardResponse[PresignedDownloadResponse](
        success=True,
        message="Ephemeral presigned download URL generated",
        data=PresignedDownloadResponse(signed_url=signed_url, expires_in=300),
    )
