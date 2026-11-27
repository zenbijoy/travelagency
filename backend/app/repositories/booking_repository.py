"""
Booking Data Access Repository.
Manages transactional persistence, row-level locking, and state transitions for bookings.
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional, Sequence, Tuple
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.booking import Booking, BookingItem, BookingPassenger, BookingPayment
from app.repositories.base import BaseRepository


class BookingRepository(BaseRepository[Booking]):

    def __init__(self, db: AsyncSession):
        super().__init__(Booking, db)

    async def get_booking_with_details(self, booking_id: uuid.UUID) -> Optional[Booking]:
        """Fetch booking with items, passengers, and payments."""
        stmt = (
            select(Booking)
            .where(Booking.id == booking_id)
            .options(
                selectinload(Booking.items),
                selectinload(Booking.passengers),
                selectinload(Booking.payments),
                selectinload(Booking.events),
            )
            .execution_options(populate_existing=True)
        )
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def get_by_reference(self, reference: str) -> Optional[Booking]:
        """Fetch booking by unique booking reference code (e.g. SJ-20261106-A4B7)."""
        stmt = (
            select(Booking)
            .where(Booking.booking_reference == reference.strip())
            .options(
                selectinload(Booking.items),
                selectinload(Booking.passengers),
                selectinload(Booking.payments),
                selectinload(Booking.events),
            )
        )
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def lock_booking_for_update(self, booking_id: uuid.UUID) -> Optional[Booking]:
        """
        Acquire pessimistic row-level lock on booking row (SELECT ... FOR UPDATE).
        Prevents concurrent webhook execution or conflicting state mutations.
        """
        stmt = (
            select(Booking)
            .where(Booking.id == booking_id)
            .with_for_update()
            .options(
                selectinload(Booking.items),
                selectinload(Booking.passengers),
                selectinload(Booking.payments),
                selectinload(Booking.events),
            )
        )
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def list_user_bookings(
        self,
        user_id: uuid.UUID,
        status: Optional[str] = None,
        offset: int = 0,
        limit: int = 20,
        tenant_id: Optional[uuid.UUID] = None,
    ) -> Tuple[Sequence[Booking], int]:
        """List user bookings with optional status filter and pagination.

        When tenant_id is supplied, results are strictly scoped to that tenant
        (tenant isolation). This is enforced server-side and cannot be bypassed
        by the client.
        """
        filters = [Booking.user_id == user_id]
        if tenant_id is not None:
            filters.append(Booking.tenant_id == tenant_id)
        if status:
            filters.append(Booking.status == status)

        base_query = (
            select(Booking)
            .where(and_(*filters))
            .options(selectinload(Booking.items), selectinload(Booking.passengers))
            .order_by(Booking.created_at.desc())
        )

        count_query = select(func.count(Booking.id)).where(and_(*filters))
        total_res = await self.db.execute(count_query)
        total = total_res.scalar_one() or 0

        paged_query = base_query.offset(offset).limit(limit)
        res = await self.db.execute(paged_query)
        bookings = res.scalars().all()

        return bookings, total

    async def get_booking_for_tenant(
        self,
        booking_id: uuid.UUID,
        tenant_id: uuid.UUID,
    ) -> Optional[Booking]:
        """Fetch a booking scoped to a specific tenant (tenant isolation).

        Returns None if the booking does not exist or does not belong to the
        given tenant, so callers can uniformly treat it as not-found.
        """
        stmt = (
            select(Booking)
            .where(Booking.id == booking_id, Booking.tenant_id == tenant_id)
            .options(
                selectinload(Booking.items),
                selectinload(Booking.passengers),
                selectinload(Booking.payments),
                selectinload(Booking.events),
            )
            .execution_options(populate_existing=True)
        )
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()
