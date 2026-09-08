// Package jwt implements the JWT validation from auth/jwt.rs:
// HMAC first, then Cloudflare Access RS256 via JWKS.
package jwt

import (
	"crypto"
	"crypto/hmac"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"
)

type Claims struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Exp   int64  `json:"exp"`
	Iat   int64  `json:"iat"`
	Aud   any    `json:"aud"`
}

type jwk struct {
	Kid string  `json:"kid"`
	N   *string `json:"n"`
	E   *string `json:"e"`
}

type jwks struct {
	Keys []jwk `json:"keys"`
}

const jwksCacheTTL = 6 * time.Hour

// hmacLeeway mirrors jsonwebtoken's default 60s leeway.
const hmacLeeway = 60

type JWTValidator struct {
	teamDomain string
	aud        string
	hmacSecret string
	httpClient *http.Client
	mu         sync.RWMutex
	cachedJWKS *jwks
	cachedAt   time.Time
}

func NewJWTValidator(teamDomain, aud, hmacSecret string) *JWTValidator {
	return &JWTValidator{
		teamDomain: teamDomain,
		aud:        aud,
		hmacSecret: hmacSecret,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func b64urlDecode(s string) ([]byte, error) {
	if m := len(s) % 4; m != 0 {
		s += strings.Repeat("=", 4-m)
	}
	return base64.URLEncoding.DecodeString(s)
}

func splitToken(token string) (headerB64, payloadB64, sigB64 string, ok bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", "", "", false
	}
	return parts[0], parts[1], parts[2], true
}

func decodeHeader(token string) (kid, alg string, err error) {
	hB64, _, _, ok := splitToken(token)
	if !ok {
		return "", "", fmt.Errorf("malformed token")
	}
	raw, err := b64urlDecode(hB64)
	if err != nil {
		return "", "", fmt.Errorf("bad header: %w", err)
	}
	var h struct {
		Kid string `json:"kid"`
		Alg string `json:"alg"`
	}
	if err := json.Unmarshal(raw, &h); err != nil {
		return "", "", err
	}
	return h.Kid, h.Alg, nil
}

func decodePayload(token string) (Claims, error) {
	_, pB64, _, ok := splitToken(token)
	if !ok {
		return Claims{}, fmt.Errorf("malformed token")
	}
	raw, err := b64urlDecode(pB64)
	if err != nil {
		return Claims{}, err
	}
	var c Claims
	if err := json.Unmarshal(raw, &c); err != nil {
		return Claims{}, err
	}
	return c, nil
}

func audContains(aud any, want string) bool {
	switch v := aud.(type) {
	case string:
		return v == want
	case []any:
		for _, e := range v {
			if s, ok := e.(string); ok && s == want {
				return true
			}
		}
	}
	return false
}

func (v *JWTValidator) validateHMAC(token string) (Claims, error) {
	hB64, pB64, sB64, ok := splitToken(token)
	if !ok {
		return Claims{}, fmt.Errorf("malformed token")
	}
	if _, alg, err := decodeHeader(token); err != nil || alg != "HS256" {
		return Claims{}, fmt.Errorf("not HS256")
	}
	mac := hmac.New(sha256.New, []byte(v.hmacSecret))
	mac.Write([]byte(hB64 + "." + pB64))
	sig, err := b64urlDecode(sB64)
	if err != nil {
		return Claims{}, err
	}
	if !hmac.Equal(mac.Sum(nil), sig) {
		return Claims{}, fmt.Errorf("bad signature")
	}
	c, err := decodePayload(token)
	if err != nil {
		return Claims{}, err
	}
	if c.Exp == 0 || time.Now().Unix() > c.Exp+hmacLeeway {
		return Claims{}, fmt.Errorf("expired")
	}
	return c, nil
}

func (v *JWTValidator) getJWKS() (*jwks, error) {
	v.mu.RLock()
	if v.cachedJWKS != nil && time.Since(v.cachedAt) < jwksCacheTTL {
		defer v.mu.RUnlock()
		return v.cachedJWKS, nil
	}
	v.mu.RUnlock()

	resp, err := v.httpClient.Get("https://" + v.teamDomain + "/cdn-cgi/access/certs")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch JWKS: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var parsed jwks
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse JWKS: %w", err)
	}
	v.mu.Lock()
	v.cachedJWKS = &parsed
	v.cachedAt = time.Now()
	v.mu.Unlock()
	return &parsed, nil
}

func rsaKeyFromJWK(k jwk) (*rsa.PublicKey, error) {
	if k.N == nil || k.E == nil {
		return nil, fmt.Errorf("JWK missing n/e")
	}
	nBytes, err := b64urlDecode(*k.N)
	if err != nil {
		return nil, err
	}
	eBytes, err := b64urlDecode(*k.E)
	if err != nil {
		return nil, err
	}
	n := new(big.Int).SetBytes(nBytes)
	var e int
	if len(eBytes) < 8 {
		padded := make([]byte, 8)
		copy(padded[8-len(eBytes):], eBytes)
		e = int(int64(binary.BigEndian.Uint64(padded)))
	} else {
		e = int(new(big.Int).SetBytes(eBytes).Int64())
	}
	return &rsa.PublicKey{N: n, E: e}, nil
}

func (v *JWTValidator) validateCloudflare(token string) (Claims, error) {
	kid, alg, err := decodeHeader(token)
	if err != nil {
		return Claims{}, err
	}
	if kid == "" {
		return Claims{}, fmt.Errorf("JWT header missing kid")
	}
	if alg != "RS256" {
		return Claims{}, fmt.Errorf("unexpected alg %q", alg)
	}
	set, err := v.getJWKS()
	if err != nil {
		return Claims{}, err
	}
	var match *jwk
	for i := range set.Keys {
		if set.Keys[i].Kid == kid {
			match = &set.Keys[i]
			break
		}
	}
	if match == nil {
		return Claims{}, fmt.Errorf("no matching JWK for kid: %s", kid)
	}
	pub, err := rsaKeyFromJWK(*match)
	if err != nil {
		return Claims{}, fmt.Errorf("invalid RSA key: %w", err)
	}
	hB64, pB64, sB64, _ := splitToken(token)
	sig, err := b64urlDecode(sB64)
	if err != nil {
		return Claims{}, err
	}
	digest := sha256.Sum256([]byte(hB64 + "." + pB64))
	if err := rsa.VerifyPKCS1v15(pub, crypto.SHA256, digest[:], sig); err != nil {
		return Claims{}, fmt.Errorf("JWT validation failed: %w", err)
	}
	c, err := decodePayload(token)
	if err != nil {
		return Claims{}, err
	}
	if c.Exp == 0 || time.Now().Unix() > c.Exp+hmacLeeway {
		return Claims{}, fmt.Errorf("expired")
	}
	if !audContains(c.Aud, v.aud) {
		return Claims{}, fmt.Errorf("bad audience")
	}
	// Issuer check mirrors jsonwebtoken set_issuer(["https://{team}.cloudflareaccess.com"]).
	// The issuer lives in the payload; verify it explicitly.
	_, pRaw, _, _ := splitToken(token)
	if raw, err := b64urlDecode(pRaw); err == nil {
		var m map[string]any
		if json.Unmarshal(raw, &m) == nil {
			wantIss := "https://" + v.teamDomain + ".cloudflareaccess.com"
			if iss, _ := m["iss"].(string); iss != wantIss {
				return Claims{}, fmt.Errorf("bad issuer")
			}
		}
	}
	return c, nil
}

// Validate tries HMAC first, then Cloudflare Access (mirrors jwt.rs).
func (v *JWTValidator) Validate(token string) (Claims, error) {
	if c, err := v.validateHMAC(token); err == nil {
		return c, nil
	}
	return v.validateCloudflare(token)
}
