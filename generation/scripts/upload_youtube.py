#!/usr/bin/env python3
"""
Upload a rendered short to YouTube via the Data API v3.
Supports scheduled publish (status.publishAt), title/description from chunks.json
when using --cache-key, list API to deduce next daily slot, and duplicate prevention
by checking videos.list for an existing video with the same title.

Keep separate from pipeline: user chooses which videos to upload.
Run from project root or generation/scripts/.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Add scripts to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent))
from models import Chunks
from path_utils import cache_path, generation_root, project_root
from logger import error, info, warn

# Optional Google API imports (required for upload)
try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
except ImportError:
    Request = Credentials = InstalledAppFlow = build = MediaFileUpload = None

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
]
DEFAULT_TIME_OF_DAY = "09:00"  # HH:MM local
RECENT_VIDEOS_LIMIT = 15  # One list call: dedupe titles + latest publish time


def list_my_videos_recent(youtube) -> tuple[set[str], list[datetime]]:
    """
    List the channel's last RECENT_VIDEOS_LIMIT uploads (by playlist order).
    Uses channels.list(mine=True) -> uploads playlist -> playlistItems -> videos for status.
    Returns (titles for dedupe, publish times for next slot).
    """
    # Get authenticated user's uploads playlist ID
    ch = youtube.channels().list(part="contentDetails", mine=True).execute()
    items = ch.get("items", [])
    if not items:
        return set(), []
    uploads_id = items[0]["contentDetails"]["relatedPlaylists"]["uploads"]

    # List most recent uploads (playlist order = newest first)
    pl = youtube.playlistItems().list(
        playlistId=uploads_id,
        part="snippet",
        maxResults=RECENT_VIDEOS_LIMIT,
    ).execute()
    pl_items = pl.get("items", [])
    if not pl_items:
        return set(), []

    video_ids = [
        it["snippet"]["resourceId"]["videoId"]
        for it in pl_items
        if it["snippet"].get("resourceId", {}).get("videoId")
    ]
    if not video_ids:
        return set(), []

    # Fetch snippet+status for publishAt (scheduled) and titles
    vresp = youtube.videos().list(
        id=",".join(video_ids),
        part="snippet,status",
    ).execute()
    titles: set[str] = set()
    times: list[datetime] = []
    for item in vresp.get("items", []):
        snippet = item.get("snippet", {})
        status = item.get("status", {})
        if snippet.get("title"):
            titles.add(snippet["title"])
        raw = status.get("publishAt") or snippet.get("publishedAt")
        if raw:
            try:
                dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                times.append(dt)
            except ValueError:
                pass
    return titles, times


def get_authenticated_service():
    """OAuth2 desktop flow; returns YouTube API service."""
    if build is None:
        raise RuntimeError(
            "Install Google API client: pip install google-api-python-client google-auth-oauthlib google-auth-httplib2"
        )
    creds = None
    token_path = generation_root() / "token.json"
    credentials_path = generation_root() / "credentials.json"
    if not credentials_path.exists():
        credentials_path = project_root() / "credentials.json"
    if not credentials_path.exists():
        error("credentials.json not found. Place OAuth 2.0 desktop credentials in generation/ or project root.")
        sys.exit(1)
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(credentials_path), SCOPES)
            creds = flow.run_local_server(port=0)
        if token_path.exists() or generation_root().exists():
            token_path.parent.mkdir(parents=True, exist_ok=True)
            with open(token_path, "w") as f:
                f.write(creds.to_json())
    return build("youtube", "v3", credentials=creds)


def next_publish_time(
    publish_times: list[datetime],
    default_time_str: str = DEFAULT_TIME_OF_DAY,
) -> datetime:
    """
    Next publish slot from publish_times (from list_my_videos_recent).
    One video per day at default_time_str (HH:MM). If latest is over 1 day ago,
    use the next occurrence of that time (today or tomorrow).
    """
    try:
        hour, minute = map(int, default_time_str.strip().split(":"))
    except (ValueError, AttributeError):
        hour, minute = 9, 0
    now = datetime.now(timezone.utc).astimezone()
    today_at_slot = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if today_at_slot <= now:
        tomorrow_at_slot = today_at_slot + timedelta(days=1)
    else:
        tomorrow_at_slot = today_at_slot

    if not publish_times:
        return tomorrow_at_slot if today_at_slot <= now else today_at_slot

    latest_utc = max(publish_times)
    latest_local = latest_utc.astimezone(now.tzinfo)
    if now - latest_local > timedelta(days=1):
        # Latest was more than 1 day ago: next schedule = next occurrence of default time
        return tomorrow_at_slot if today_at_slot <= now else today_at_slot
    # Else: day after latest at default time
    next_local = (latest_local + timedelta(days=1)).replace(hour=hour, minute=minute, second=0, microsecond=0)
    if next_local <= now:
        next_local += timedelta(days=1)
    return next_local


def to_rfc3339(dt: datetime) -> str:
    """Convert datetime to RFC 3339 string for YouTube API."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.now().astimezone().tzinfo)
    return dt.isoformat()


def parse_publish_at(s: str) -> datetime:
    """Parse user input like '2025-02-20 09:00' or '02/20/2025, 09:00' into datetime (local)."""
    s = s.strip()
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%m/%d/%Y, %H:%M", "%m/%d/%Y, %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=datetime.now().astimezone().tzinfo)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse publish time: {s!r}")


def load_metadata_from_chunks(cache_key: str) -> tuple[str, str]:
    """Load title and description from cache/{cache_key}/chunks.json via Chunks model. Returns (title, description)."""
    chunks_path = cache_path(cache_key, "chunks.json")
    if not chunks_path.exists():
        return "", ""
    try:
        raw = chunks_path.read_text(encoding="utf-8")
        data = json.loads(raw)
        # Backward compat: old chunks.json may lack title/description (Chunks defaults them to "")
        if "title" not in data:
            data["title"] = ""
        if "description" not in data:
            data["description"] = ""
        chunks = Chunks.model_validate(data)
        return chunks.title, chunks.description
    except (json.JSONDecodeError, OSError, ValueError):
        return "", ""


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Upload a short to YouTube (API v3). Use --cache-key or --video. Title/description from chunks.json or CLI."
    )
    parser.add_argument("--cache-key", help="Cache key: video = cache/{key}/short.mp4, metadata from chunks.json")
    parser.add_argument("--video", help="Path to video file (alternative to --cache-key)")
    parser.add_argument("--title", help="Override title")
    parser.add_argument("--description", help="Override description")
    parser.add_argument("--privacy", default="private", choices=("public", "unlisted", "private"), help="Privacy (default: private for scheduled)")
    parser.add_argument("--publish-at", help="Explicit publish time (e.g. '2025-02-20 09:00'). If omitted, next slot is deduced from list API.")
    parser.add_argument("--default-time", default=DEFAULT_TIME_OF_DAY, help="Default time of day for next slot (HH:MM, default 09:00)")
    parser.add_argument("--tags", help="Comma-separated tags")
    args = parser.parse_args()

    if not args.cache_key and not args.video:
        error("Provide either --cache-key or --video.")
        sys.exit(1)
    if args.cache_key and args.video:
        error("Provide only one of --cache-key or --video.")
        sys.exit(1)

    # Resolve video path
    if args.cache_key:
        video_path = cache_path(args.cache_key, "short.mp4")
        if not video_path.exists():
            error(f"Video not found: {video_path}")
            sys.exit(1)
        title, description = load_metadata_from_chunks(args.cache_key)
    else:
        video_path = Path(args.video).resolve()
        if not video_path.exists():
            error(f"Video not found: {video_path}")
            sys.exit(1)
        title, description = "", ""

    if args.title:
        title = args.title
    if args.description:
        description = args.description

    if not title and args.cache_key:
        error("Title is required. Add --title or re-run chunker to get title in chunks.json.")
        sys.exit(1)
    if not title:
        error("Title is required. Use --title.")
        sys.exit(1)

    # Authenticate and get service
    youtube = get_authenticated_service()

    # One list call: titles for dedupe, times for next slot
    existing_titles, publish_times = list_my_videos_recent(youtube)
    if title in existing_titles:
        warn(f"A video with title {title!r} already exists on the channel. Skipping to avoid duplicate.")
        sys.exit(0)

    # Publish time
    if args.publish_at:
        try:
            publish_dt = parse_publish_at(args.publish_at)
            publish_at_rfc = to_rfc3339(publish_dt)
        except ValueError as e:
            error(str(e))
            sys.exit(1)
    else:
        publish_dt = next_publish_time(publish_times, args.default_time)
        publish_at_rfc = to_rfc3339(publish_dt)
        info(f"Next publish slot: {publish_at_rfc}")

    # Build request body
    tags_list = [t.strip() for t in (args.tags or "").split(",") if t.strip()]
    body = {
        "snippet": {
            "title": title[:100],
            "description": description or "",
            "tags": tags_list,
        },
        "status": {
            "privacyStatus": args.privacy,
            "publishAt": publish_at_rfc,
        },
    }

    # Upload
    info(f"Uploading {video_path} as {title!r} (scheduled {publish_at_rfc})...")
    try:
        media = MediaFileUpload(str(video_path), mimetype="video/*", resumable=True)
        request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
        response = None
        while response is None:
            status, response = request.next_chunk()
            if status:
                info(f"  Uploaded {int(status.progress() * 100)}%")
        video_id = response["id"]
        info(f"Uploaded. Video ID: {video_id}")
        info(f"  https://youtube.com/shorts/{video_id}")
    except Exception as e:
        error(f"Upload failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
