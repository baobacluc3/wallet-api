# Talking points for this project

Questions you should be able to answer cold if this is on your CV.

**"How do you prevent a stolen refresh token from being used silently?"**
Every refresh token belongs to a `familyId` set at login. Rotation revokes the
old token and mints a new one in the same family. If a revoked token is ever
presented again, that's proof it was copied — the server can't tell which
copy is the attacker's, so it revokes the entire family and forces re-login,
rather than silently accepting a "looks fine" token.

**"Why not just check expiry on the refresh token?"**
Expiry only tells you the token hasn't timed out — it says nothing about
whether it's been used before. Reuse detection is a separate check: has this
exact token already been rotated away. That's the difference between "valid"
and "still the current one."

**"Why argon2id over bcrypt?"**
Argon2id is the Password Hashing Competition winner — memory-hard, which
makes GPU/ASIC brute-forcing far more expensive than bcrypt's purely
CPU-bound cost factor. Also resistant to both side-channel and
time-memory tradeoff attacks, which is why OWASP recommends it as the
first choice today.

**"Why RS256 instead of HS256?"**
HS256 uses one shared secret to both sign and verify — anything that can
verify a token can also forge one. RS256 signs with a private key and
verifies with a public key, so a service that only needs to verify tokens
(a downstream microservice, for example) never holds the ability to mint
them.

**"What stops user A from touching user B's wallet?"**
A valid JWT alone isn't authorization — it just proves identity.
`WalletOwnerGuard` runs after authentication and checks the wallet's
`userId` against `req.user.id` before the route handler runs. This is the
IDOR (insecure direct object reference) problem, and the fix is checking
ownership on every object-scoped request, not just validating the token.

**"How is this consistent with the locking you used for wallet transfers?"**
The refresh-rotation flow uses the same `QueryRunner` + `pessimistic_write`
lock pattern as the wallet transfer service. Two concurrent refresh calls
with the same token are a race condition for the same reason two concurrent
withdrawals are: without a lock, both requests can read "not yet rotated"
and both succeed, which would let the same refresh token mint two live
sessions instead of one.

**"How do you stop brute-force login attempts?"**
Two independent layers: `@nestjs/throttler` rate-limits by IP (stops a
single source from hammering the login endpoint), and a per-account
`failedLoginAttempts` counter locks the *account* after 5 failures
regardless of IP (stops a distributed attempt against one target).

**"How would you revoke access immediately if a user reports a stolen laptop?"**
`POST /auth/logout-all` revokes every refresh token for that user across
every family, so no device can rotate into a new access token again. The
current access token on the stolen device still has up to ~15 minutes of
life left by design (JWTs are stateless) — call out this window and explain
that's the standard access/refresh tradeoff.
