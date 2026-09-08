-module(fitmentor_ws@community_db_ffi).
-export([connect/1, query/3, close/1, row_field/2, row_count/1]).

%% ponytail: minimal PostgreSQL v3.0 wire-protocol client with SSL support.
%% Handles simple queries only. Upgrade path: epgsql library via Hex.

connect(DatabaseUrl) ->
    io:format(standard_error, "DB CONNECT START~n", []),
    case parse_url(DatabaseUrl) of
        {error, E} -> {error, to_bin(E)};
        {ok, #{host := Host, port := Port, user := User, password := Pass, dbname := Db, ssl := Ssl}} ->
            io:format(standard_error, "DB CONNECT TO ~s:~p ssl=~p user=~s db=~s~n", [Host, Port, Ssl, User, Db]),
            TcpOpts = [binary, {packet, raw}, {active, false}, {keepalive, true}],
            case maybe_ssl_connect(Host, Port, TcpOpts, Ssl) of
                {ok, Sock, Transport} ->
                    io:format(standard_error, "DB CONNECTED OK, sending startup~n", []),
                    startup(Sock, Transport, User, Db),
                    io:format(standard_error, "DB STARTUP SENT, authenticating~n", []),
                    case authenticate(Sock, Transport, User, Pass) of
                        ok -> {ok, {Sock, Transport}};
                        {error, E2} ->
                            close({Sock, Transport}),
                            io:format(standard_error, "DB AUTH FAIL: ~p~n", [E2]),
                            {error, to_bin(E2)}
                    end;
                {error, E2} ->
                    io:format(standard_error, "DB CONN FAIL: ~p~n", [E2]),
                    {error, to_bin(E2)}
            end
    end.

to_bin(B) when is_binary(B) -> B;
to_bin(A) when is_atom(A) -> atom_to_binary(A, utf8);
to_bin(E) -> list_to_binary(io_lib:format("~p", [E])).

maybe_ssl_connect(Host, Port, TcpOpts, true) ->
    case gen_tcp:connect(Host, Port, TcpOpts, 10000) of
        {ok, TcpSock} ->
            %% PostgreSQL SSL negotiation: send SSLRequest, read 1-byte response
            SSLRequest = <<8:32/unsigned, 80877103:32/unsigned>>,
            gen_tcp:send(TcpSock, SSLRequest),
            case gen_tcp:recv(TcpSock, 1, 5000) of
                {ok, <<"S">>} ->
                    %% Server supports SSL — upgrade
                    SslOpts = [{server_name_indication, disable}, {verify, verify_none}],
                    case ssl:connect(TcpSock, SslOpts, 10000) of
                        {ok, SslSock} -> {ok, SslSock, ssl};
                        {error, E} -> gen_tcp:close(TcpSock), {error, E}
                    end;
                {ok, <<"N">>} ->
                    %% Server doesn't support SSL, use TCP
                    {ok, TcpSock, gen_tcp};
                {ok, Other} ->
                    gen_tcp:close(TcpSock),
                    {error, {ssl_refused, Other}};
                {error, E} ->
                    gen_tcp:close(TcpSock),
                    {error, E}
            end;
        {error, E} -> {error, E}
    end;
maybe_ssl_connect(Host, Port, TcpOpts, false) ->
    case gen_tcp:connect(Host, Port, TcpOpts, 10000) of
        {ok, Sock} -> {ok, Sock, gen_tcp};
        {error, E} -> {error, E}
    end.

sock_send(Sock, Transport, Data) -> Transport:send(Sock, Data).
sock_recv(Sock, Transport, Len) -> Transport:recv(Sock, Len, 30000).
sock_close(Sock, Transport) -> Transport:close(Sock).

query({Sock, Transport}, Sql, Params) when is_binary(Sql) ->
    %% Substitute $N params into SQL for simple query protocol
    FinalSql = substitute_params(Sql, Params, 1),
    io:format(standard_error, "DB QUERY len=~p first100=~p~n", [byte_size(FinalSql), binary:part(FinalSql, 0, erlang:min(byte_size(FinalSql), 100))]),
    io:format(standard_error, "DB QUERY has_nul=~p~n", [binary:match(FinalSql, <<0>>) =/= nomatch]),
    sock_send(Sock, Transport, <<$Q, (byte_size(FinalSql) + 5):32/unsigned, FinalSql/binary, 0>>),
    collect_results(Sock, Transport, []);
query(_, _, _) ->
    {error, <<"invalid_query">>}.

substitute_params(Sql, [], _N) -> Sql;
substitute_params(Sql, [P | Rest], N) ->
    Placeholder = <<"$", (integer_to_binary(N))/binary>>,
    Escaped = escape_param(P),
    NewSql = binary:replace(Sql, Placeholder, Escaped, [global]),
    substitute_params(NewSql, Rest, N + 1).

escape_param(P) when is_binary(P) ->
    %% SQL-safe: escape single quotes
    Escaped = binary:replace(P, <<"'">>, <<"''">>, [global]),
    <<"'", Escaped/binary, "'">>;
escape_param(P) when is_list(P) ->
    escape_param(list_to_binary(P));
escape_param(_) -> <<"'NULL'">>.

close({Sock, Transport}) -> sock_close(Sock, Transport).

row_field(Row, Key) when is_map(Row), is_binary(Key) ->
    case maps:find(Key, Row) of
        {ok, null} -> <<>>;
        {ok, V} when is_binary(V) -> V;
        {ok, V} when is_list(V) -> list_to_binary(V);
        {ok, V} when is_integer(V) -> integer_to_binary(V);
        {ok, V} when is_float(V) -> float_to_binary(V, [{decimals, 2}]);
        {ok, true} -> <<"true">>;
        {ok, false} -> <<"false">>;
        error -> <<>>;
        _ -> <<>>
    end;
row_field(_, _) -> <<>>.

row_count(Rows) when is_list(Rows) -> length(Rows);
row_count(_) -> 0.

%% ── URL parsing ────────────────────────────────────────────────────

parse_url(Url) when is_binary(Url) ->
    parse_url(binary_to_list(Url));
parse_url(Url) ->
    %% Check for sslmode in query string
    Ssl = string:find(Url, "sslmode=require") /= nomatch,
    Stripped = case lists:prefix("postgresql://", Url) of
        true -> lists:nthtail(13, Url);
        false ->
            case lists:prefix("postgres://", Url) of
                true -> lists:nthtail(11, Url);
                false -> Url
            end
    end,
    case string:find(Stripped, "@", trailing) of
        nomatch ->
            parse_host_port(Stripped, "", "", Ssl);
        _ ->
            Idx = length(Stripped) - length(string:find(Stripped, "@", trailing)),
            UserPass = lists:sublist(Stripped, Idx),
            Rest = lists:nthtail(Idx + 1, Stripped),
            case string:find(UserPass, ":", leading) of
                nomatch ->
                    parse_host_port(Rest, UserPass, "", Ssl);
                _ ->
                    CIdx = length(UserPass) - length(string:find(UserPass, ":", leading)),
                    User = lists:sublist(UserPass, CIdx),
                    Pass = lists:nthtail(CIdx + 1, UserPass),
                    parse_host_port(Rest, User, Pass, Ssl)
            end
    end.

parse_host_port(Rest, User, Pass, Ssl) ->
    case string:find(Rest, "/", leading) of
        nomatch ->
            {ok, #{host => Rest, port => 5432, user => User, password => Pass, dbname => "", ssl => Ssl}};
        _ ->
            Idx = length(Rest) - length(string:find(Rest, "/", leading)),
            HostPort = lists:sublist(Rest, Idx),
            DbRaw = lists:nthtail(Idx + 1, Rest),
            Db = case string:find(DbRaw, "?") of
                nomatch -> DbRaw;
                _ ->
                    QIdx = length(DbRaw) - length(string:find(DbRaw, "?")),
                    lists:sublist(DbRaw, QIdx)
            end,
            {Host, Port} = case string:find(HostPort, ":", leading) of
                nomatch -> {HostPort, 5432};
                _ ->
                    CIdx = length(HostPort) - length(string:find(HostPort, ":", leading)),
                    H = lists:sublist(HostPort, CIdx),
                    PStr = lists:nthtail(CIdx + 1, HostPort),
                    try list_to_integer(PStr) of
                        P -> {H, P}
                    catch _:_ -> {HostPort, 5432}
                    end
            end,
            {ok, #{host => Host, port => Port, user => User, password => Pass, dbname => Db, ssl => Ssl}}
    end.

%% ── PostgreSQL wire protocol ───────────────────────────────────────

startup(Sock, Transport, User, Db) ->
    UserBin = list_to_binary(User),
    DbBin = list_to_binary(Db),
    Body = <<0, 3, 0, 0,
             "user", 0, UserBin/binary, 0,
             "database", 0, DbBin/binary, 0,
             "client_encoding", 0, "UTF8", 0,
             "password_encryption", 0, "md5", 0,
             0>>,
    Len = byte_size(Body) + 4,
    sock_send(Sock, Transport, <<Len:32/unsigned, Body/binary>>).

authenticate(Sock, Transport, User, Pass) ->
    UserBin = list_to_binary(User),
    case recv_msg(Sock, Transport) of
        {error, E} -> {error, E};
        %% AuthenticationOK: R + length(8) + auth_type(0)
        {ok, <<"R", _Len:32/unsigned, 0, 0, 0, 0>>} -> ok;
        %% CleartextPassword: R + length(8) + auth_type(3)
        {ok, <<"R", _Len:32/unsigned, 0, 0, 0, 3>>} ->
            PassBin = list_to_binary(Pass),
            send_password(Sock, Transport, PassBin),
            case recv_msg(Sock, Transport) of
                {ok, <<"R", _L:32/unsigned, 0, 0, 0, 0>>} -> ok;
                Other -> {error, {auth_failed, Other}}
            end;
        %% MD5Password: R + length(12) + auth_type(5) + salt(4)
        {ok, <<"R", _Len:32/unsigned, 0, 0, 0, 5, Salt:4/binary>>} ->
            Md5 = md5_hash(Pass, binary_to_list(Salt)),
            send_password(Sock, Transport, Md5),
            case recv_msg(Sock, Transport) of
                {ok, <<"R", _L:32/unsigned, 0, 0, 0, 0>>} -> ok;
                Other -> {error, {auth_failed, Other}}
            end;
        %% SASL: R + length + auth_type(10) + mechanism_list(null-terminated)
        {ok, <<"R", _Len:32/unsigned, 0, 0, 0, 10, MechList/binary>>} ->
            scram_sha256_auth(Sock, Transport, User, Pass, MechList);
        Other ->
            {error, {auth_unknown, Other}}
    end.

scram_sha256_auth(Sock, Transport, User, Pass, MechList) ->
    io:format(standard_error, "DB SCRAM START user_type=~p pass_type=~p~n", [erlang:is_list(User), erlang:is_list(Pass)]),
    UserBin = list_to_binary(User),
    io:format(standard_error, "DB SCRAM step1 UserBin=~p~n", [UserBin]),
    ClientNonce = base64:encode(crypto:strong_rand_bytes(24)),
    io:format(standard_error, "DB SCRAM step2 nonce_ok=~p~n", [byte_size(ClientNonce) > 0]),
    CFirstBare = <<"n=", UserBin/binary, ",r=", ClientNonce/binary>>,
    CFirstMsg = <<"n,,", CFirstBare/binary>>,
    InitResp = <<"SCRAM-SHA-256", 0, (byte_size(CFirstMsg)):32/unsigned, CFirstMsg/binary>>,
    SASLInitMsg = <<"p", (byte_size(InitResp) + 4):32/unsigned, InitResp/binary>>,
    io:format(standard_error, "DB SCRAM step3 sending SASLInit~n", []),
    sock_send(Sock, Transport, SASLInitMsg),
    io:format(standard_error, "DB SCRAM step4 waiting SASLContinue~n", []),
    case recv_msg(Sock, Transport) of
        {ok, <<"R", _L:32/unsigned, 0, 0, 0, 11, ServerFirst/binary>>} ->
            io:format(standard_error, "DB SCRAM step5 got SASLContinue len=~p~n", [byte_size(ServerFirst)]),
            SFirstStr = binary_to_list(ServerFirst),
            SParams = parse_sasl_params(SFirstStr),
            io:format(standard_error, "DB SCRAM params=~p~n", [SParams]),
            {_, SNonce} = lists:keyfind("r", 1, SParams),
            {_, SaltB64} = lists:keyfind("s", 1, parse_sasl_params(SFirstStr)),
            {_, IterStr} = lists:keyfind("i", 1, parse_sasl_params(SFirstStr)),
            Salt = base64:decode(SaltB64),
            IterCount = list_to_integer(IterStr),
            %% SCRAM AuthMessage per RFC 5802:
            %%   client-first-message-bare + "," + server-first-message + "," + client-final-message-without-proof
            SNonceBin0 = list_to_binary(SNonce),
            CFinalWithoutProof = <<"c=biws,r=", SNonceBin0/binary>>,
            AuthMsg = <<CFirstBare/binary, ",", ServerFirst/binary, ",", CFinalWithoutProof/binary>>,
            io:format(standard_error, "DB SCRAM step6a salt_ok=~p iter=~p~n", [byte_size(Salt) > 0, IterCount]),
            PassBin = list_to_binary(Pass),
            io:format(standard_error, "DB SCRAM step6b calling pbkdf2 passbin=~p~n", [PassBin]),
            SaltedPassword = pbkdf2_hmac(sha256, PassBin, Salt, IterCount, 32),
            io:format(standard_error, "DB SCRAM step6c pbkdf2 done~n", []),
            ClientKey = hmac256(SaltedPassword, <<"Client Key">>),
            io:format(standard_error, "DB SCRAM step6d hmac done~n", []),
            StoredKey = sha256(ClientKey),
            ClientSig = hmac256(StoredKey, AuthMsg),
            io:format(standard_error, "DB SCRAM step6e sig done~n", []),
            ClientProof = exor(ClientKey, ClientSig),
            io:format(standard_error, "DB SCRAM step6f proof done~n", []),
            ProofB64 = base64:encode(ClientProof),
            CFinal = <<"c=biws,r=", SNonceBin0/binary, ",p=", ProofB64/binary>>,
            FinalResp = <<"p", (byte_size(CFinal) + 4):32/unsigned, CFinal/binary>>,
            io:format(standard_error, "DB SCRAM step7 sending final~n", []),
            sock_send(Sock, Transport, FinalResp),
            case recv_msg(Sock, Transport) of
                {ok, <<"R", _L2:32/unsigned, 0, 0, 0, 12, _ServerFinal/binary>>} ->
                    io:format(standard_error, "DB SCRAM step8 got SASLFinal~n", []),
                    case recv_msg(Sock, Transport) of
                        {ok, <<"R", _L3:32/unsigned, 0, 0, 0, 0>>} ->
                            io:format(standard_error, "DB SCRAM AUTH OK~n", []),
                            ok;
                        Other2 -> {error, {auth_failed_after_sasl, Other2}}
                    end;
                Other1 -> {error, {sasl_final_expected, Other1}}
            end;
        Other -> {error, {sasl_continue_expected, Other}}
    end.

parse_sasl_params(Str) -> parse_sasl_params(Str, []).
parse_sasl_params([], Acc) -> lists:reverse(Acc);
parse_sasl_params([$= | Rest], Acc) ->
    %% We're inside a value, skip to next comma or end
    case lists:splitwith(fun(C) -> C /= $, end, Rest) of
        {_, [$, | Rest2]} -> parse_sasl_params(Rest2, Acc);
        {_, []} -> lists:reverse(Acc)
    end;
parse_sasl_params(Str, Acc) ->
    {Key, [$= | ValRest]} = lists:splitwith(fun(C) -> C /= $= end, Str),
    {Val, Rest} = case lists:splitwith(fun(C) -> C /= $, end, ValRest) of
        {V, [$, | R]} -> {V, R};
        {V, []} -> {V, []}
    end,
    parse_sasl_params(Rest, [{Key, Val} | Acc]).

hmac256(Key, Data) ->
    crypto:mac(hmac, sha256, Key, Data).

sha256(Data) ->
    crypto:hash(sha256, Data).

pbkdf2_hmac(sha256, Password, Salt, Iterations, KeyLen) ->
    %% Use Erlang's crypto:pbkdf2_hmac
    crypto:pbkdf2_hmac(sha256, Password, Salt, Iterations, KeyLen).

exor(A, B) ->
    exor(A, B, <<>>).
exor(<<>>, <<>>, Acc) -> Acc;
exor(<<A, Rest1/binary>>, <<B, Rest2/binary>>, Acc) ->
    exor(Rest1, Rest2, <<Acc/binary, (A bxor B)>>).

send_password(Sock, Transport, PassBin) ->
    Body = <<$p, (byte_size(PassBin) + 5):32/unsigned, PassBin/binary, 0>>,
    sock_send(Sock, Transport, Body).

drain_after_auth(Sock, Transport) ->
    case recv_msg(Sock, Transport) of
        {ok, <<"S", _Len:32/unsigned, _/binary>>} -> drain_after_auth(Sock, Transport);
        {ok, <<"K", _Len:32/unsigned, _/binary>>} -> drain_after_auth(Sock, Transport);
        {ok, <<"Z", _Len:32/unsigned, _/binary>>} -> ok;
        _ -> ok
    end.

md5_hash(Pass, Salt) ->
    Bin = list_to_binary(Pass),
    SaltBin = list_to_binary(Salt),
    S1 = binary_to_hex(crypto:hash(md5, <<Bin/binary, SaltBin/binary>>)),
    S2 = binary_to_hex(crypto:hash(md5, <<S1/binary, Bin/binary>>)),
    <<"md5", S2/binary>>.

binary_to_hex(Bin) ->
    << <<(hex_char(N))>> || <<N:4>> <= Bin >>.

hex_char(N) when N < 10 -> $0 + N;
hex_char(N) -> $a + N - 10.

encode_param(null) -> <<0, 0, 0, 0, -1:32/signed>>;
encode_param(V) when is_binary(V) -> <<0, 0, 0, 0, (byte_size(V)):32/signed, V/binary>>;
encode_param(V) when is_list(V) ->
    B = list_to_binary(V),
    <<0, 0, 0, 0, (byte_size(B)):32/signed, B/binary>>;
encode_param(V) when is_integer(V) -> <<0, 0, 0, 0, 8:32/signed, V:64/signed>>;
encode_param(V) when is_float(V) -> <<0, 0, 0, 0, 8:32/signed, V:64/float>>;
encode_param(true) -> <<0, 0, 0, 0, 1:32/signed, 1:8>>;
encode_param(false) -> <<0, 0, 0, 0, 1:32/signed, 0:8>>;
encode_param(_) -> <<0, 0, 0, 0, -1:32/signed>>.

collect_results(Sock, Transport, Acc) ->
    case recv_msg(Sock, Transport) of
        {error, E} ->
            io:format(standard_error, "DB COLLECT ERROR: ~p~n", [E]),
            case Acc of
                [] -> {error, to_bin(E)};
                _ -> {ok, lists:reverse(Acc)}
            end;
        {ok, <<"T", _:32/unsigned, Rest/binary>>} ->
            NumFields = binary:decode_unsigned(binary:part(Rest, 0, 2), big),
            FieldDefs = parse_fields(Rest, 2, NumFields, []),
            recv_data_rows(Sock, Transport, FieldDefs, Acc);
        {ok, <<"I", _:32/unsigned>>} ->
            io:format(standard_error, "DB COLLECT I~n", []),
            {ok, lists:reverse(Acc)};
        {ok, <<"C", _:32/unsigned, CmdResult/binary>>} ->
            io:format(standard_error, "DB COLLECT C: ~p~n", [CmdResult]),
            {ok, lists:reverse(Acc)};
        {ok, <<"Z", _:32/unsigned, _/binary>>} ->
            io:format(standard_error, "DB COLLECT Z acc=~p~n", [length(Acc)]),
            case Acc of
                [] -> collect_results(Sock, Transport, Acc);
                _ -> {ok, lists:reverse(Acc)}
            end;
        {ok, <<"E", Len:32/unsigned, Fields/binary>>} ->
            Msg = extract_error_fields(Fields, <<>>),
            io:format(standard_error, "DB COLLECT E: ~p~n", [Msg]),
            {error, Msg};
        {ok, <<"N", _:32/unsigned, _/binary>>} -> collect_results(Sock, Transport, Acc);
        {ok, _Other} -> collect_results(Sock, Transport, Acc)
    end.

recv_data_rows(Sock, Transport, FieldDefs, Acc) ->
    case recv_msg(Sock, Transport) of
        {error, E} ->
            case Acc of
                [] -> {error, to_bin(E)};
                _ -> {ok, lists:reverse(Acc)}
            end;
        {ok, <<"D", _:32/unsigned, Data/binary>>} ->
            Row = parse_data_row(Data, FieldDefs, []),
            recv_data_rows(Sock, Transport, FieldDefs, [Row | Acc]);
        {ok, <<"C", _:32/unsigned, _/binary>>} -> {ok, lists:reverse(Acc)};
        {ok, <<"Z", _:32/unsigned, _/binary>>} -> {ok, lists:reverse(Acc)};
        {ok, <<"I", _:32/unsigned>>} -> {ok, lists:reverse(Acc)};
        {ok, <<"E", Len:32/unsigned, Fields/binary>>} ->
            Msg = extract_error_fields(Fields, <<>>),
            {error, Msg};
        {ok, <<"N", _:32/unsigned, _/binary>>} -> recv_data_rows(Sock, Transport, FieldDefs, Acc);
        {ok, _Other} -> recv_data_rows(Sock, Transport, FieldDefs, Acc)
    end.

parse_fields(<<>>, _Off, _N, Acc) -> lists:reverse(Acc);
parse_fields(Bin, Off, _N, Acc) when Off >= byte_size(Bin) -> lists:reverse(Acc);
parse_fields(Bin, Off, N, Acc) ->
    {Name, AfterName} = read_cstring(Bin, Off),
    NameBin = list_to_binary(Name),
    SkipOff = AfterName + 18,
    case SkipOff > byte_size(Bin) of
        true -> lists:reverse(Acc);
        false -> parse_fields(Bin, SkipOff, N - 1, [NameBin | Acc])
    end.

read_cstring(Bin, Off) ->
    case Off < byte_size(Bin) of
        true ->
            Len = cstring_len(Bin, Off, 0),
            Name = binary_to_list(binary:part(Bin, Off, Len)),
            {Name, Off + Len + 1};
        false -> {"", Off}
    end.

cstring_len(Bin, Off, Acc) ->
    case Bin of
        <<_:Off/binary, 0, _/binary>> -> Acc;
        <<_:Off/binary, _, _/binary>> -> cstring_len(Bin, Off + 1, Acc + 1);
        _ -> Acc
    end.

%% Extract human-readable message from PostgreSQL error fields
%% Error fields: Type(1) Value(null-terminated) ... terminated by 0
extract_error_fields(<<>>, _Acc) -> <<"unknown_error">>;
extract_error_fields(<<0>>, Acc) -> Acc;
extract_error_fields(<<FieldCode:8, Rest/binary>>, Acc) ->
    {Value, Rest2} = read_cstring_binary(Rest),
    case FieldCode of
        $M -> Value;  %% 'M' = Message field — return this one
        _ -> extract_error_fields(Rest2, Value)
    end;
extract_error_fields(_, Acc) -> Acc.

read_cstring_binary(Bin) -> read_cstring_binary(Bin, <<>>).
read_cstring_binary(<<>>, Acc) -> {Acc, <<>>};
read_cstring_binary(<<0, Rest/binary>>, Acc) -> {Acc, Rest};
read_cstring_binary(<<C, Rest/binary>>, Acc) -> read_cstring_binary(Rest, <<Acc/binary, C>>).

parse_data_row(<<_NumCols:16/unsigned, Rest/binary>>, FieldDefs, _Acc) ->
    parse_cols(Rest, FieldDefs, [], 0).

parse_cols(<<>>, _FieldDefs, Acc, _Idx) ->
    maps:from_list(lists:reverse(Acc));
parse_cols(Bin, FieldDefs, Acc, Idx) ->
    case Bin of
        <<-1:32/signed, Rest/binary>> ->
            ColName = safe_field(FieldDefs, Idx),
            parse_cols(Rest, FieldDefs, [{ColName, null} | Acc], Idx + 1);
        <<Len:32/signed, Value:Len/binary, Rest/binary>> ->
            ColName = safe_field(FieldDefs, Idx),
            io:format(standard_error, "DB COL name=~p val=~p~n", [ColName, Value]),
            parse_cols(Rest, FieldDefs, [{ColName, Value} | Acc], Idx + 1);
        _ -> maps:from_list(lists:reverse(Acc))
    end.

safe_field(List, Idx) ->
    case lists:nthtail(Idx, List) of
        [H | _] when is_binary(H) -> H;
        [H | _] when is_list(H) -> list_to_binary(H);
        [] -> <<"col_", (integer_to_binary(Idx))/binary>>
    end.

recv_msg(Sock, Transport) ->
    case sock_recv(Sock, Transport, 5) of
        {ok, <<Type:8, Len:32/unsigned>>} ->
            PayloadLen = Len - 4,
            case PayloadLen > 0 of
                true ->
                    case sock_recv(Sock, Transport, PayloadLen) of
                        {ok, Payload} -> {ok, <<Type:8, Len:32/unsigned, Payload/binary>>};
                        {error, E} -> {error, E}
                    end;
                false -> {ok, <<Type:8, Len:32/unsigned>>}
            end;
        {error, E} -> {error, E};
        Other -> io:format(standard_error, "DB RECV UNEXPECTED: ~p~n", [Other]), {error, recv_failed}
    end.
