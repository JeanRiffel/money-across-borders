# JWT Implementation Guide

## Overview
This document outlines the JWT (JSON Web Token) implementation for the Clean Ledger application.

## Changes Made

### 1. **JWTService Enhancement** ([src/infra/authentication/jwt-service.ts](src/infra/authentication/jwt-service.ts))
- Added proper JWT generation with configurable expiration (default: 1 hour)
- Improved token verification with proper error handling
- Added environment variable validation
- Imported `JwtPayload` type for better type safety

**Key Features:**
- `generate(payload, expiresIn?)`: Creates JWT tokens with optional expiration
- `verify(token)`: Verifies and decodes JWT tokens
- Proper error handling for invalid/expired tokens

### 2. **Token Authentication Interface Update** ([src/application/shared/authentication/token-authentication.ts](src/application/shared/authentication/token-authentication.ts))
- Updated `TokenGenerator` to include optional `expiresIn` parameter
- Updated `TokenVerifier` return type to `JwtPayload | string`
- Better type safety with `JwtPayload` import from jsonwebtoken

### 3. **JWT Factory** ([src/infra/factories/jwt-factory.ts](src/infra/factories/jwt-factory.ts))
- Created factory function `createJWTService()` for dependency injection
- Ensures single instance of JWTService is created and managed properly

### 4. **Auth Middleware Enhancement** ([src/interfaces/http/middlewares/auth.middleware.ts](src/interfaces/http/middlewares/auth.middleware.ts))
- Added proper return type annotation
- Extended Express Request interface with custom `AuthenticatedRequest`
- Implemented `req.user` assignment to store decoded payload
- Added TypeScript interface instead of namespace declaration (ESLint compliant)

**Features:**
- Extracts token from `Authorization: Bearer <token>` header
- Returns 401 for missing or invalid tokens
- Attaches decoded payload to request object for downstream handlers

### 5. **Account Router Update** ([src/interfaces/http/routes/account/routes.ts](src/interfaces/http/routes/account/routes.ts))
- Updated to accept `TokenVerifier` dependency
- Properly wires middleware with token verifier instance
- Added return type annotation for clarity

### 6. **Server Bootstrap** ([src/main/server.ts](src/main/server.ts))
- Instantiates `JWTService` using the factory
- Passes token verifier to account router
- Properly integrates JWT authentication into the application

### 7. **Environment Configuration**
- Added `JWT_SECRET` to both `.env` and `.env.example`
- Ensures secure token signing with environment-based secret

### 8. **Comprehensive Tests** ([__tests__/infra/authentication/jwt-service.test.ts](__tests__/infra/authentication/jwt-service.test.ts))
- ✓ Token generation validation
- ✓ Default expiration handling
- ✓ Custom expiration support
- ✓ Token verification with valid tokens
- ✓ Invalid token error handling

## Usage

### Generate a Token
```typescript
const jwtService = new JWTService();
const token = jwtService.generate({ userId: '123', email: 'user@example.com' });
// Token expires in 1 hour by default

// Custom expiration
const token = jwtService.generate({ userId: '123' }, '24h');
```

### Verify a Token
```typescript
const payload = jwtService.verify(token);
console.log(payload); // { userId: '123', email: 'user@example.com', iat, exp }
```

### Using in Express Routes
```typescript
import { authMiddleware } from './interfaces/http/middlewares/auth.middleware'
import { JWTService } from './infra/authentication/jwt-service'

const jwtService = new JWTService();

app.post('/protected', authMiddleware(jwtService), (req, res) => {
  console.log(req.user); // Decoded JWT payload
  res.json({ message: 'Success', user: req.user });
});
```

## Security Best Practices

1. **JWT_SECRET**: Store in environment variables, never hardcode
2. **Expiration**: Set appropriate expiration times (default 1h is reasonable)
3. **HTTPS Only**: Always use HTTPS in production
4. **Token Refresh**: Consider implementing refresh tokens for long-lived sessions
5. **Payload**: Avoid storing sensitive data in JWT payload (it's base64 encoded, not encrypted)
6. **Validation**: Always verify token signature on the server

## Environment Variables

```dotenv
JWT_SECRET=your-super-secret-jwt-key-here
```

**Important**: Use a strong, random secret in production.

## Login Endpoint (POST /login)

The gap this document originally flagged — "nothing issues a token over HTTP" — is closed. `POST /login`
(`LoginUseCase`, `src/application/user/uses-cases/login-use-case.ts`) authenticates against the `User`
aggregate (email + bcrypt password hash) and returns a normal, server-issued JWT.

```
POST /login
Content-Type: application/json

{ "email": "jane@example.com", "password": "correct-password" }
```

Response (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "userId": "...",
  "accountId": "...",
  "email": "jane@example.com"
}
```

Wrong password or unknown email both return `401` with a generic "Invalid email or password" message
(`InvalidCredentialsError`) — deliberately not distinguishing the two, so the endpoint can't be used to
enumerate registered emails.

The token payload is `{ userId, accountId }`. `accountId` comes from `AccountRepository.findByUserId`,
since the rest of the API (`/wallets`, `/remittances`) still authorizes by `accountId`, not `userId`.

Note `authMiddleware` only verifies the token's signature and expiry — it does not check that the token's
`accountId` matches the `accountId` in a request body. There's no per-resource authorization layer yet, so
any logged-in user's token currently works for any account's wallet/remittance calls.

Unlike `POST /account`, `/wallets`, and `/remittances`, `LoginUseCase` is **not** wrapped in
`IdempotentDecorator` — see the comment in `src/main/user/user-module.ts` for why (a login is meant to
mint a fresh token every time, not replay a cached one).

## API Authentication

### Request Format
```
GET /api/account HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Response Codes
- `200 OK`: Request successful
- `401 Unauthorized`: Missing or invalid token
- `500 Internal Server Error`: Server error

## Testing

Run tests with:
```bash
npm test
```

All tests pass ✓

## Files Modified

- [src/infra/authentication/jwt-service.ts](src/infra/authentication/jwt-service.ts)
- [src/application/shared/authentication/token-authentication.ts](src/application/shared/authentication/token-authentication.ts)
- [src/interfaces/http/middlewares/auth.middleware.ts](src/interfaces/http/middlewares/auth.middleware.ts)
- [src/interfaces/http/routes/account/routes.ts](src/interfaces/http/routes/account/routes.ts)
- [src/main/server.ts](src/main/server.ts)
- [.env](.env)
- [.env.example](.env.example)

## Files Created

- [src/infra/factories/jwt-factory.ts](src/infra/factories/jwt-factory.ts)
- [__tests__/infra/authentication/jwt-service.test.ts](__tests__/infra/authentication/jwt-service.test.ts)