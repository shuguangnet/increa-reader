"""
Calendar view API routes - scan repo for date-named files
"""

import re
from pathlib import Path
from typing import Dict

from fastapi import HTTPException

from .models import WorkspaceConfig

# Match YYYY-MM-DD in filenames (e.g. 2024-01-15.md, journal/2024-01-15.md)
DATE_PATTERN = re.compile(r"(\d{4})-(\d{2})-(\d{2})")


def create_calendar_routes(app, workspace_config: WorkspaceConfig):
    """Create calendar API routes"""

    @app.get("/api/calendar")
    async def get_calendar(repo: str, year: int, month: int):
        """Get calendar data for a given month in a repo"""
        repo_config = next(
            (r for r in workspace_config.repos if r.name == repo), None
        )
        if not repo_config:
            raise HTTPException(
                status_code=404, detail=f"Repository '{repo}' not found"
            )

        if month < 1 or month > 12:
            raise HTTPException(
                status_code=400, detail="Month must be between 1 and 12"
            )

        repo_root = Path(repo_config.root)
        days: Dict[str, dict] = {}

        # Walk the repo looking for files with date patterns in name/path
        try:
            for item in repo_root.rglob("*"):
                # Skip hidden dirs/files and node_modules
                if any(part.startswith(".") for part in item.parts):
                    continue
                if "node_modules" in item.parts:
                    continue
                if not item.is_file():
                    continue

                match = DATE_PATTERN.search(item.name)
                if not match:
                    continue

                file_year = int(match.group(1))
                file_month = int(match.group(2))
                file_day = int(match.group(3))

                if file_year != year or file_month != month:
                    continue

                if not (1 <= file_day <= 31):
                    continue

                relative_path = str(item.relative_to(repo_root))
                day_key = str(file_day)

                if day_key not in days:
                    days[day_key] = {"files": []}
                days[day_key]["files"].append({"path": relative_path})
        except PermissionError:
            raise HTTPException(
                status_code=403, detail="Permission denied scanning repository"
            )

        return {"year": year, "month": month, "days": days}