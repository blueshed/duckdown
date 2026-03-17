# Project Review: Duckdown

**Date:** 2026-03-17
**Version Reviewed:** 0.0.49

## Overview

Duckdown is a Python/Tornado-based CMS for creating and publishing markdown-driven websites. It features a Vue 3 frontend editor, dual storage backends (local filesystem + Amazon S3), and static site publishing capabilities.

## Architecture

The project is well-organized with clear separation of concerns:

- `duckdown/handlers/` — Tornado request handlers (auth, editor, markdown, files, S3)
- `duckdown/utils/` — Storage abstraction, markdown conversion, navigation generation
- `duckdown/tool/` — CLI tools (create, run, publish, AWS provisioning)
- `client/` — Vue 3 + Vuex + Vite frontend

Handler composition uses mixins (UserMixin, ConverterMixin, AssetsMixin). The storage layer abstracts local filesystem vs S3 behind a common interface.

## Strengths

1. **Clean modular structure** with good separation of concerns
2. **Solid test infrastructure** — pytest-tornado integration tests, Docker-based S3 testing with MinIO
3. **Dual storage abstraction** — local and S3 backends share a common interface
4. **Modern frontend stack** — Vue 3, Vuex 4, Vite, CodeMirror
5. **Useful CLI tooling** — invoke-based tasks for dev, build, publish, and AWS provisioning
6. **MIT License** — clear open-source licensing

## Security Issues

| Severity | Issue | Location |
|----------|-------|----------|
| CRITICAL | Path traversal — user-supplied `path` joined without sanitization | `dir_handler.py:22,39,46`, `site_handler.py:84` |
| CRITICAL | No path validation in `put_file()` for both storage backends | `folder.py:54-63`, `s3_folders.py:113-141` |
| HIGH | Hardcoded cookie secret: `"it was a dark and stormy duckdown"` | `config.py:45` |
| HIGH | Debug mode uses predictable `time.time()` for cookie secret | `config.py:100-105` |
| HIGH | CORS `Access-Control-Allow-Origin: *` in debug mode | `base_handler.py:11-17` |
| MEDIUM | No CSRF token in login form | `templates/login.html:76` |
| MEDIUM | Bare `except Exception` swallows errors silently | `access_control.py:129` |
| MEDIUM | Encryption key read from env var without validation | `encrypt.py:16` |

### Path Traversal (Critical)

The most critical issue. User-supplied paths in `dir_handler.py` and `site_handler.py` are joined with base directories without boundary checking. A malicious user could request paths like `../../../etc/passwd` to access files outside the intended directory.

**Fix:** Add path boundary validation:
```python
real_path = os.path.realpath(os.path.join(base_dir, user_path))
if not real_path.startswith(os.path.realpath(base_dir)):
    raise tornado.web.HTTPError(403, "Access denied")
```

### Cookie Secret (High)

The default cookie secret `"it was a dark and stormy duckdown"` is publicly visible in the source code. In debug mode, `time.time()` is used which is predictable.

**Fix:** Generate cryptographically random secrets:
```python
import secrets
cookie_secret = secrets.token_hex(32)
```

## Code Quality Issues

1. **No type hints** — makes the codebase harder to maintain and reason about
2. **Missing abstract base class** for Folder/S3Folder — relies on duck typing
3. **Mutable class variable** `sites = {}` in `static_files.py:13` — shared state across instances
4. **Inconsistent error handling** — mix of `HTTPError`, generic `Exception`, and silent `except: pass`
5. **Magic strings** — hardcoded prefixes like `"x-script-"` in `site_handler.py:116`
6. **No dependency version pinning** in `requirements.txt`
7. **Dependency mismatch** — `requirements.txt` includes `aiobotocore` but `setup.py` does not

## Test Coverage

- ~970 lines of tests covering local operations, S3 operations, subdirectories, and encryption
- Good use of fixtures and Docker-based integration testing

### Gaps

- No security-focused tests (path traversal, XSS, authentication bypass)
- No unit tests for individual utility modules
- `duckdown/tool/*` excluded from coverage measurement
- No load or performance tests

## Dependency Management

### Runtime (`requirements.txt`)
- tornado, markdown, pymdown-extensions, invoke, python-dotenv, boto3, aiobotocore, cryptography, tld

### Issues
- No version pinning — builds may break on dependency updates
- No lock file (Pipfile.lock, poetry.lock, etc.)
- `aiobotocore` present in `requirements.txt` but missing from `setup.py`

## Recommendations

### Immediate (Security Critical)
- [ ] Add path boundary validation using `os.path.realpath()` + prefix checks
- [ ] Generate cryptographically random cookie secrets in all modes
- [ ] Add CSRF protection to forms
- [ ] Force credential changes on first login or document security setup

### Short-term
- [ ] Pin dependency versions in `requirements.txt`
- [ ] Reconcile `requirements.txt` with `setup.py`
- [ ] Add security-focused test cases (path traversal, auth bypass)
- [ ] Replace bare `except Exception` with specific exception types

### Medium-term
- [ ] Add type hints across the codebase
- [ ] Create an abstract base class for the storage interface (Folder/S3Folder)
- [ ] Add API endpoint documentation
- [ ] Implement audit logging for file operations

### Long-term
- [ ] Implement role-based access control
- [ ] Add configuration schema validation
- [ ] Separate business logic from HTTP handlers
- [ ] Consider migrating from `invoke` to a more standard CLI framework (e.g., `click`)

## Summary

Duckdown is a well-structured project with a clear purpose, good test infrastructure, and a clean architecture. The dual-storage abstraction and modern frontend are notable strengths. The main areas needing attention are **input validation and security** (particularly path handling) and **dependency management**. The codebase would also benefit from type hints and more comprehensive test coverage around edge cases and security scenarios.
