# API Versioning Policy

**Version:** 1.0  
**Date:** 2026-08-21  
**Owner:** Backend Lead

---

## Versioning Scheme

This API uses **URL-prefix versioning** with `Accept` header negotiation as a secondary mechanism.

### URL Prefix

```
/api/v1/shares
/api/v1/auth/login
/api/v1/users
```

- The current version is **v1**.
- Omitting the version prefix defaults to the **latest** version.
- The `X-API-Version` response header indicates which version was resolved.

### Accept Header (Secondary)

```
Accept: application/vnd.cs.v1+json
```

Useful for clients that cannot easily modify the URL path.

---

## Version Lifecycle

| Phase | Description |
|-------|-------------|
| **Active** | Current default version. Full support. |
| **Deprecated** | Still functional but `X-API-Deprecated: true` and `Sunset` headers returned. |
| **Sunset** | No longer available. Returns `400 unsupported_api_version`. |

### Schedule

- **Support window**: N-1 for **12 months** after a new version is released.
- **Deprecation notice**: `Sunset` header set to **6 months** from deprecation date.
- **Breaking changes**: Only introduced in new versions (never in existing).

---

## Client Guidance

### Requesting a Specific Version

```http
GET /api/v1/shares HTTP/1.1
```

or

```http
GET /api/shares HTTP/1.1
Accept: application/vnd.cs.v1+json
```

### Detecting Deprecation

```http
HTTP/1.1 200 OK
X-API-Version: 1
X-API-Deprecated: true
Sunset: Sat, 21 Feb 2027 00:00:00 GMT
```

When you see `X-API-Deprecated: true`, plan to migrate to a newer version before the `Sunset` date.

### Unsupported Version

```json
{
  "statusCode": 400,
  "message": "unsupported_api_version",
  "supportedVersions": ["1"]
}
```

---

## Related Files

- **Middleware**: `backend/src/main.ts` (inline API version middleware)
- **Policy**: This document (`docs/api-versioning.md`)