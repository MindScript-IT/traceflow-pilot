"""Invite codes: check, redeem, membership probe.

One company code per manufacturer (minted by the founder on /founder).
Signup validates the code BEFORE creating the account, then auto-redeems it
— the manufacturer never sees a second step. Founder minting lives in
app/routes/founder.py (founder-key gated, manufacturer portal untouched).
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app import errors
from pydantic import BaseModel

from app.auth import Caller, ensure_workspace_exists, get_caller
from app.db import get_pool

router = APIRouter()


class RedeemBody(BaseModel):
    code: str


async def _lookup_code(conn, code: str, *, allow_exhausted: bool = False):
    """Shared validity check: returns (invite_row) or raises a friendly error.

    allow_exhausted=True lets redeem distinguish "code is full" from "this
    user is already a member" (re-redeeming must be a no-op, not an error).
    """
    code_hash = hashlib.sha256(code.strip().encode()).hexdigest()
    cur = await conn.execute(
        "SELECT id, workspace_id, role, expires_at, max_uses, used_count"
        " FROM invites WHERE code_hash = %s",
        (code_hash,),
    )
    row = await cur.fetchone()
    if row is None:
        raise errors.bad_invite()
    _invite_id, _workspace_id, _role, expires_at, max_uses, used_count = (
        row[0], str(row[1]), row[2], row[3], row[4], row[5],
    )
    if expires_at is not None and expires_at < datetime.now(timezone.utc):
        raise errors.invite_expired()
    if not allow_exhausted and max_uses is not None and used_count >= max_uses:
        raise errors.invite_used()
    return row


@router.post("/api/invites/check")
async def check_invite(body: RedeemBody):
    """Public pre-check used by signup: is this company code usable?
    No session needed, reveals only usable/unusable (codes are high-entropy,
    enumeration is impractical). Lets signup refuse BEFORE creating the account,
    so nobody ends up registered-but-locked-out."""
    if not (body.code or "").strip():
        raise errors.bad_invite()
    pool = await get_pool()
    async with pool.connection() as conn:
        row = await _lookup_code(conn, body.code)
    seats_left = (row[4] - row[5]) if row[4] is not None else None
    return {"ok": True, "seats_left": seats_left}


@router.get("/api/membership/me")
async def my_membership(caller: Caller = Depends(get_caller)):
    """Auth-only probe: is this signed-in user a workspace member yet?
    The login page shows the join box ONLY when member=false (rare edge:
    account created but code ran out before redeem)."""
    return {"member": caller.role != "none",
            "workspace_id": caller.workspace_id, "role": caller.role}


@router.post("/api/invites/redeem")
async def redeem_invite(body: RedeemBody, caller: Caller = Depends(get_caller)):
    pool = await get_pool()
    async with pool.connection() as conn:
        row = await _lookup_code(conn, body.code or "", allow_exhausted=True)
        invite_id, workspace_id, role = row[0], str(row[1]), row[2]
        max_uses, used_count = row[4], row[5]
        cur = await conn.execute(
            "SELECT role FROM memberships WHERE user_id = %s AND workspace_id = %s",
            (caller.user_id, workspace_id),
        )
        existing = await cur.fetchone()
        if existing is not None:
            # Already joined: never consume another seat.
            return {"workspace_id": workspace_id, "role": existing[0]}
        if max_uses is not None and used_count >= max_uses:
            raise errors.invite_used()
        await ensure_workspace_exists(conn, workspace_id)
        async with conn.transaction():
            # Only a NEW membership consumes a seat. Re-redeeming the same code
            # (or joining a workspace you already belong to) must not burn seats.
            cur = await conn.execute(
                "INSERT INTO memberships (user_id, workspace_id, role)"
                " VALUES (%s, %s, %s)"
                " ON CONFLICT (user_id, workspace_id) DO NOTHING"
                " RETURNING user_id",
                (caller.user_id, workspace_id, role),
            )
            inserted = await cur.fetchone()
            if inserted is not None:
                # Atomic seat cap: concurrent redeems cannot exceed max_uses.
                cur = await conn.execute(
                    "UPDATE invites SET used_count = used_count + 1"
                    " WHERE id = %s AND (max_uses IS NULL OR used_count < max_uses)"
                    " RETURNING used_count",
                    (invite_id,),
                )
                if await cur.fetchone() is None:
                    raise errors.invite_used()
                await conn.execute(
                    "INSERT INTO audit_log (workspace_id, actor, action, entity_type, entity_id, detail)"
                    " VALUES (%s, %s, 'invite.redeemed', 'workspace', %s, %s::jsonb)",
                    (workspace_id, caller.user_id, workspace_id, json.dumps({"role": role})),
                )
    return {"workspace_id": workspace_id, "role": role}
