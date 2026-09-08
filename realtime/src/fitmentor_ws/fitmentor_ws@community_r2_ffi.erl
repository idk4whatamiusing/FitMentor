-module(fitmentor_ws@community_r2_ffi).
-export([presign_put/6]).

%% Generate an S3-compatible presigned PUT URL for Cloudflare R2.
%% ponytail: minimal AWS SigV4 signing, PUT only, no expiry config.
%% Upgrade path: erlcloud_s3.put_object or CF Workers for presigned URLs.

presign_put(Bucket, Key, AccessKey, SecretKey, Region, Host) ->
    presign_put(Bucket, Key, AccessKey, SecretKey, Region, Host, 3600).
presign_put(Bucket, Key, AccessKey, SecretKey, Region, Host, Expires) ->
    now_sec = erlang:system_time(second),
    AmzDate = format_iso8601_basic(erlang:universaltime()),
    DateStamp = string:slice(AmzDate, 0, 8),
    CredentialScope = DateStamp ++ "/" ++ Region ++ "/s3/aws4_request",
    CanonicalUri = "/" ++ binary_to_list(Key),
    CanonicalQueryString = "X-Amz-Algorithm=AWS4-HMAC-SHA256"
        ++ "&X-Amz-Credential=" ++ binary_to_list(AccessKey) ++ "/" ++ CredentialScope
        ++ "&X-Amz-Date=" ++ AmzDate
        ++ "&X-Amz-Expires=" ++ integer_to_list(Expires)
        ++ "&X-Amz-SignedHeaders=host",
    CanonicalHeaders = "host:" ++ binary_to_list(Host) ++ "\n",
    SignedHeaders = "host",
    PayloadHash = binary_to_hex(crypto:hash(sha256, <<>>)),
    CanonicalRequest = "PUT\n" ++ CanonicalUri ++ "\n" ++ CanonicalQueryString ++ "\n"
        ++ CanonicalHeaders ++ "\n" ++ SignedHeaders ++ "\n" ++ PayloadHash,
    StringToSign = "AWS4-HMAC-SHA256\n" ++ AmzDate ++ "\n" ++ CredentialScope ++ "\n"
        ++ binary_to_hex(crypto:hash(sha256, list_to_binary(CanonicalRequest))),
    SigningKey = derive_key(SecretKey, DateStamp, Region, "s3"),
    Signature = binary_to_hex(hmac_sha256(SigningKey, list_to_binary(StringToSign))),
    Url = "https://" ++ binary_to_list(Host) ++ CanonicalUri ++ "?" ++ CanonicalQueryString
        ++ "&X-Amz-Signature=" ++ Signature,
    list_to_binary(Url).

derive_key(Secret, DateStamp, Region, Service) ->
    K1 = hmac_sha256(<<"AWS4", Secret/binary>>, list_to_binary(DateStamp)),
    K2 = hmac_sha256(K1, list_to_binary(Region)),
    K3 = hmac_sha256(K2, list_to_binary(Service)),
    hmac_sha256(K3, <<"aws4_request">>).

hmac_sha256(Key, Data) when is_binary(Key), is_binary(Data) ->
    crypto:mac(hmac, sha256, Key, Data).

binary_to_hex(Bin) ->
    string:lowercase(binary:encode_hex(Bin)).

format_iso8601_basic(DateTime) ->
    {{Y, Mo, D}, {H, Mi, S}} = DateTime,
    io_lib:format("~4..0B~2..0B~2..0BT~2..0B~2..0B~2..0BZ", [Y, Mo, D, H, Mi, S]).
