use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub email: String,
    pub exp: usize,
    pub iat: usize,
    pub aud: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct Jwk {
    kid: String,
    #[allow(dead_code)]
    kty: String,
    #[serde(rename = "use")]
    #[allow(dead_code)]
    use_: Option<String>,
    n: Option<String>,
    e: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct Jwks {
    keys: Vec<Jwk>,
}

pub struct JwtValidator {
    team_domain: String,
    aud: String,
    hmac_secret: String,
    cache: RwLock<Option<(Jwks, std::time::Instant)>>,
    client: reqwest::Client,
}

const JWKS_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(6 * 60 * 60);

impl JwtValidator {
    pub fn new(team_domain: String, aud: String) -> Self {
        Self {
            team_domain,
            aud,
            hmac_secret: std::env::var("JWT_SECRET").unwrap_or_else(|_| "fitmentor-dev-secret-change-in-production".to_string()),
            cache: RwLock::new(None),
            client: reqwest::Client::new(),
        }
    }

    async fn fetch_jwks(&self) -> Result<Jwks, String> {
        let url = format!(
            "https://{}/cdn-cgi/access/certs",
            self.team_domain
        );
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("failed to fetch JWKS: {e}"))?;
        let jwks: Jwks = resp
            .json()
            .await
            .map_err(|e| format!("failed to parse JWKS: {e}"))?;
        Ok(jwks)
    }

    async fn get_jwks(&self) -> Result<Jwks, String> {
        {
            let cache = self.cache.read().await;
            if let Some((jwks, ts)) = cache.as_ref() {
                if ts.elapsed() < JWKS_CACHE_TTL {
                    return Ok(jwks.clone());
                }
            }
        }
        let jwks = self.fetch_jwks().await?;
        {
            let mut cache = self.cache.write().await;
            *cache = Some((jwks.clone(), std::time::Instant::now()));
        }
        Ok(jwks)
    }

    fn decode_jwt_header_kid(token: &str) -> Result<String, String> {
        let header = decode_header(token)
            .map_err(|e| format!("failed to decode JWT header: {e}"))?;
        header
            .kid
            .ok_or_else(|| "JWT header missing kid".to_string())
    }

    fn find_jwk<'a>(jwks: &'a Jwks, kid: &str) -> Result<&'a Jwk, String> {
        jwks.keys
            .iter()
            .find(|k| k.kid == kid)
            .ok_or_else(|| format!("no matching JWK for kid: {kid}"))
    }

    fn build_decoding_key(jwk: &Jwk) -> Result<DecodingKey, String> {
        let n = jwk.n.as_ref().ok_or("JWK missing n")?;
        let e = jwk.e.as_ref().ok_or("JWK missing e")?;
        DecodingKey::from_rsa_components(n, e).map_err(|e| format!("invalid RSA key: {e}"))
    }

    async fn validate_cloudflare_access(&self, token: &str) -> Result<Claims, String> {
        let kid = Self::decode_jwt_header_kid(token)?;
        let jwks = self.get_jwks().await?;
        let jwk = Self::find_jwk(&jwks, &kid)?;
        let key = Self::build_decoding_key(jwk)?;

        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_audience(&[&self.aud]);
        validation.set_issuer(&[format!(
            "https://{}.cloudflareaccess.com",
            self.team_domain
        )]);

        let token_data = decode::<Claims>(token, &key, &validation)
            .map_err(|e| format!("JWT validation failed: {e}"))?;

        Ok(token_data.claims)
    }

    fn validate_hmac(&self, token: &str) -> Result<Claims, String> {
        let key = DecodingKey::from_secret(self.hmac_secret.as_bytes());
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;

        let token_data = decode::<Claims>(token, &key, &validation)
            .map_err(|e| format!("HMAC JWT validation failed: {e}"))?;

        Ok(token_data.claims)
    }

    pub async fn validate(&self, token: &str) -> Result<Claims, String> {
        if let Ok(claims) = self.validate_hmac(token) {
            return Ok(claims);
        }
        self.validate_cloudflare_access(token).await
    }
}
