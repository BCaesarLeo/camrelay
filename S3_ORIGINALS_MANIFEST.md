# StudioRelay S3 Originals Archive

## Bucket: studiorelay-photos

### Storage Layout

```
studiorelay-photos/
├── delivery/          # Final delivered JPGs per contact (DELETE-PROTECTED)
│   └── {eventId}/{contactId}/{photoId}.jpg
├── thumbs/            # 600px thumbnails for gallery (DELETE-PROTECTED)
│   └── {eventId}/{contactId}/{photoId}.jpg
└── originals/         # Camera RAW + Capture One exports (AUTO-DELETES after 90 days)
    └── ANCC2026/
        ├── Capture/
        │   ├── Studio Relay0001.JPG   — Capture One full-res exports (882 files)
        │   ├── Studio Relay0001.NEF   — Nikon Z8 RAW files (128 files)
        │   └── ...
        └── burst/
            ├── BURST_0001.jpg         — Burst mode JPGs (25 files)
            ├── 20260404_*.NEF         — Additional NEF files (2 files)
            └── ...
```

### ANCC Easter 2026 — File Inventory

| Type | Count | Approx Size | S3 Path |
|------|-------|-------------|---------|
| Capture One JPGs | 882 | ~18 GB | `originals/ANCC2026/Capture/*.JPG` |
| Nikon NEF RAWs | 128 | ~6.5 GB | `originals/ANCC2026/Capture/*.NEF` |
| Burst JPGs | 25 | ~50 MB | `originals/ANCC2026/burst/BURST_*.jpg` |
| Delivered JPGs | 1,160 | ~9.6 GB | `delivery/**/*.jpg` |
| Gallery Thumbnails | 937 | ~86 MB | `thumbs/**/*.jpg` |

### Storage Classes

- `delivery/` — S3 Standard (frequently accessed via CloudFront CDN)
- `thumbs/` — S3 Standard (frequently accessed via CloudFront CDN)
- `originals/` — S3 Infrequent Access (archival, auto-deletes after 90 days)

### Protection Rules

- **delivery/** and **thumbs/** — Bucket policy DENIES all delete operations
- **originals/** — Lifecycle rule auto-deletes after 90 days (expiry ~July 5, 2026)
- **Versioning** — Enabled on entire bucket

### How to Retrieve Originals

If originals haven't expired yet:
```bash
# Download all originals for an event
aws s3 cp s3://studiorelay-photos/originals/ANCC2026/ ./ANCC2026-originals/ --recursive

# Download just NEF files
aws s3 cp s3://studiorelay-photos/originals/ANCC2026/ ./ANCC2026-raw/ --recursive --exclude "*" --include "*.NEF"

# Download just Capture One JPGs
aws s3 cp s3://studiorelay-photos/originals/ANCC2026/ ./ANCC2026-jpgs/ --recursive --exclude "*" --include "*.JPG"
```

If originals have expired but versioning preserved them:
```bash
# List deleted versions
aws s3api list-object-versions --bucket studiorelay-photos --prefix originals/ANCC2026/ --query 'DeleteMarkers[].Key'

# Restore a specific version
aws s3api delete-object --bucket studiorelay-photos --key originals/ANCC2026/Capture/file.NEF --version-id <delete-marker-version-id>
```

### Timeline

- **Uploaded**: April 6, 2026
- **Auto-delete**: ~July 5, 2026 (90 days)
- **To cancel auto-delete**: Remove the `DeleteOriginalsAfter90Days` lifecycle rule
