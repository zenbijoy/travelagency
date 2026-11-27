"""
Enterprise Anti-Bot, Anti-Scraping & Attack Surface Hardening Middleware.
Guards the Shopno Jatra API against automated crawlers, Kali Linux penetration suites,
data scrapers, SQLi probes, and L7 DoS exploitation.
"""

import re
import logging
from typing import List, Pattern
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette import status

logger = logging.getLogger(__name__)

# Known offensive security tools, aggressive scrapers, and penetration testing User-Agents
BLOCKED_USER_AGENT_PATTERNS: List[Pattern] = [
    re.compile(r"sqlmap", re.IGNORECASE),
    re.compile(r"nikto", re.IGNORECASE),
    re.compile(r"acunetix", re.IGNORECASE),
    re.compile(r"dirbuster|gobuster|ffuf|wfuzz", re.IGNORECASE),
    re.compile(r"wpscan", re.IGNORECASE),
    re.compile(r"hydra", re.IGNORECASE),
    re.compile(r"burpsuite|burpcollaborator", re.IGNORECASE),
    re.compile(r"nmap|masscan|zgrab", re.IGNORECASE),
    re.compile(r"havij", re.IGNORECASE),
    re.compile(r"metasploit", re.IGNORECASE),
]

# Attack probe patterns in URI paths or query strings (Path traversal, LFI, SQLi probes)
SUSPICIOUS_PATH_PATTERNS: List[Pattern] = [
    re.compile(r"(\.\./|\.\.\\)", re.IGNORECASE),  # Path Traversal
    re.compile(r"(etc/passwd|windows/win\.ini|boot\.ini)", re.IGNORECASE),  # LFI
    re.compile(r"(union(\s+all)?\s+select|information_schema|waitfor\s+delay)", re.IGNORECASE),  # SQLi
    re.compile(r"(<script|javascript:|onerror=)", re.IGNORECASE),  # Reflected XSS in path
    re.compile(r"(\.env|\.git|\.aws|\.ssh|\.docker|\.subversion)", re.IGNORECASE),  # Sensitive asset probing
    re.compile(r"(phpmyadmin|adminer|wp-login|wp-admin|shell\.php)", re.IGNORECASE),  # Blind CMS scans
]

MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024  # 10 MB maximum request payload cap


class BotAndScraperDefenseMiddleware(BaseHTTPMiddleware):
    """
    Zero-Trust perimeter defense middleware.
    Inspects incoming HTTP requests for signature patterns of penetration scanners,
    automated scraper suites, and payload-based exploitation before they reach routing.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        user_agent = request.headers.get("user-agent", "").strip()
        client_ip = request.client.host if request.client else "unknown"
        path_and_query = f"{request.url.path}?{request.url.query}" if request.url.query else request.url.path

        # 1. Block Automated Penetration & Hacking Suites by User-Agent
        for pattern in BLOCKED_USER_AGENT_PATTERNS:
            if pattern.search(user_agent):
                logger.warning(
                    f"[SECURITY_DEFENSE] Blocked malicious scanner User-Agent from {client_ip}: '{user_agent[:100]}'"
                )
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={
                        "success": False,
                        "error": {
                            "code": "ACCESS_DENIED",
                            "message": "Automated security scanning and unauthorized toolkits are strictly forbidden.",
                        },
                    },
                )

        # 2. Block Known Exploitation Probes in URL & Query String
        for probe_pattern in SUSPICIOUS_PATH_PATTERNS:
            if probe_pattern.search(path_and_query):
                logger.warning(
                    f"[SECURITY_DEFENSE] Blocked probe pattern in URI from {client_ip}: '{path_and_query[:150]}'"
                )
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content={
                        "success": False,
                        "error": {
                            "code": "MALFORMED_REQUEST",
                            "message": "The requested resource identifier contains prohibited character sequences.",
                        },
                    },
                )

        # 3. Request Payload Size Protection (Anti-DoS)
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                length_int = int(content_length)
                if length_int > MAX_REQUEST_BODY_BYTES:
                    logger.warning(
                        f"[SECURITY_DEFENSE] Request size exceeds limit ({length_int} > {MAX_REQUEST_BODY_BYTES}) from {client_ip}"
                    )
                    return JSONResponse(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        content={
                            "success": False,
                            "error": {
                                "code": "PAYLOAD_TOO_LARGE",
                                "message": "Request payload exceeds permissible 10MB limit.",
                            },
                        },
                    )
            except ValueError:
                pass

        # Proceed with request pipeline
        response = await call_next(request)

        # 4. Attach Comprehensive Defensive Headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-site"

        return response
