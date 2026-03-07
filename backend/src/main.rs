use std::{
    collections::HashMap,
    fs,
    net::SocketAddr,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant, SystemTime},
};

use anyhow::{Context, Result};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::RwLock;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::{error, info, warn};

const CACHE_TTL_SECS: u64 = 5;

#[derive(Clone)]
struct AppState {
    rpc_url: String,
    client: Client,
    activity: Arc<RwLock<ExplorerActivity>>,
    state_file: PathBuf,
    cache: Arc<RwLock<BackendCache>>,
}

#[derive(Debug, Serialize)]
struct ApiError {
    code: &'static str,
    message: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = match self.code {
            "not_found" => StatusCode::NOT_FOUND,
            "bad_request" => StatusCode::BAD_REQUEST,
            _ => StatusCode::BAD_GATEWAY,
        };
        (status, Json(self)).into_response()
    }
}

#[derive(Debug, Deserialize)]
struct Pagination {
    limit: Option<usize>,
    page: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct BlockRangeQuery {
    from: Option<u64>,
    to: Option<u64>,
    limit: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct NetworkStats {
    chain_id: String,
    network_id: String,
    latest_block_number: u64,
    latest_block_hash: Option<String>,
    latest_block_timestamp: Option<u64>,
    mining: bool,
    hashrate: String,
    gas_price: String,
    coinbase: String,
}

#[derive(Debug, Serialize)]
struct NetworkHealth {
    backend_ok: bool,
    rpc_ok: bool,
    rpc_latency_ms: u128,
    checked_at_unix: u64,
    detail: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ExplorerBlock {
    number: u64,
    number_hex: String,
    hash: String,
    parent_hash: String,
    timestamp: u64,
    difficulty: String,
    nonce: u64,
    miner: String,
    tx_count: usize,
    extra_data: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct BlockListResponse {
    latest_number: u64,
    page: usize,
    limit: usize,
    has_more: bool,
    items: Vec<ExplorerBlock>,
}

#[derive(Debug, Serialize, Clone)]
struct BlockRangeResponse {
    from: u64,
    to: u64,
    items: Vec<ExplorerBlock>,
}

#[derive(Debug, Serialize)]
struct AccountOverview {
    address: String,
    balance_hex: String,
    nonce_hex: String,
    tx_count_hex: String,
    utxos: Value,
}

#[derive(Debug, Serialize, Deserialize)]
struct ComputeTxResultView {
    tx_id: String,
    result: Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct RecentComputeItem {
    tx_id: String,
    seen_at_unix: u64,
    success: bool,
}

#[derive(Debug, Serialize)]
struct RecentComputeResponse {
    items: Vec<RecentComputeItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct HotAddressItem {
    address: String,
    hits: u64,
    last_seen_unix: u64,
}

#[derive(Debug, Serialize)]
struct HotAddressResponse {
    items: Vec<HotAddressItem>,
}

#[derive(Debug, Serialize)]
struct ObjectOutputView {
    id: String,
    kind: String,
    value: Value,
}

#[derive(Debug, Serialize)]
struct SearchResponse {
    kind: String,
    primary_id: String,
    canonical_route: String,
    value: Value,
}

#[derive(Debug, Deserialize)]
struct JsonRpcEnvelope {
    result: Option<Value>,
    error: Option<Value>,
}

#[derive(Debug, Clone)]
struct ExplorerActivity {
    recent_compute: Vec<RecentComputeItem>,
    hot_addresses: HashMap<String, HotAddressItem>,
}

#[derive(Debug, Serialize, Deserialize)]
struct PersistedState {
    recent_compute: Vec<RecentComputeItem>,
    hot_addresses: Vec<HotAddressItem>,
}

#[derive(Debug, Default)]
struct BackendCache {
    network_stats: Option<CachedValue<NetworkStats>>,
    block_pages: HashMap<String, CachedValue<BlockListResponse>>,
    block_ranges: HashMap<String, CachedValue<BlockRangeResponse>>,
    domains: HashMap<u64, CachedValue<Value>>,
}

#[derive(Debug, Serialize)]
struct CacheDebugSection {
    entries: usize,
    fresh: usize,
    stale: usize,
}

#[derive(Debug, Serialize)]
struct CacheDebugResponse {
    ttl_secs: u64,
    network_stats: CacheDebugSection,
    block_pages: CacheDebugSection,
    block_ranges: CacheDebugSection,
    domains: CacheDebugSection,
}

#[derive(Debug)]
struct CachedValue<T> {
    value: T,
    created_at: Instant,
}

impl<T: Clone> CachedValue<T> {
    fn get_if_fresh(&self) -> Option<T> {
        if self.created_at.elapsed() <= Duration::from_secs(CACHE_TTL_SECS) {
            Some(self.value.clone())
        } else {
            None
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    init_tracing();

    let rpc_url =
        std::env::var("ZERO_RPC_URL").unwrap_or_else(|_| "http://127.0.0.1:8545".to_string());
    let bind = std::env::var("ZERO_EXPLORER_BACKEND_BIND")
        .unwrap_or_else(|_| "127.0.0.1:18080".to_string());
    let state_file = std::env::var("ZERO_EXPLORER_STATE_FILE")
        .unwrap_or_else(|_| "./data/explorer-state.json".to_string());
    let addr: SocketAddr = bind
        .parse()
        .with_context(|| format!("invalid bind address: {bind}"))?;

    let activity = load_activity(PathBuf::from(state_file.clone())).await;

    let state = AppState {
        rpc_url,
        client: Client::builder()
            .build()
            .context("failed to build HTTP client")?,
        activity: Arc::new(RwLock::new(activity)),
        state_file: PathBuf::from(state_file),
        cache: Arc::new(RwLock::new(BackendCache::default())),
    };

    spawn_background_activity_sync(state.clone());

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/network/health", get(network_health))
        .route("/api/network/stats", get(network_stats))
        .route("/api/blocks", get(list_blocks))
        .route("/api/blocks/range", get(list_blocks_range))
        .route("/api/blocks/:number", get(get_block_by_number))
        .route("/api/accounts/:address", get(get_account_overview))
        .route("/api/activity/hot-addresses", get(list_hot_addresses))
        .route("/api/compute/recent", get(list_recent_compute))
        .route("/api/compute/:tx_id", get(get_compute_result))
        .route("/api/tx/:tx_id", get(get_tx_detail))
        .route("/api/objects/:object_id", get(get_object_view))
        .route("/api/outputs/:output_id", get(get_output_view))
        .route("/api/domains/:domain_id", get(get_domain_view))
        .route("/api/search/:query", get(search))
        .route("/api/debug/cache", get(debug_cache))
        .with_state(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!(bind = %addr, "zero explorer backend listening");
    axum::serve(listener, app).await?;
    Ok(())
}

fn spawn_background_activity_sync(state: AppState) {
    tokio::spawn(async move {
        loop {
            if let Err(err) = sync_background_activity_once(&state).await {
                warn!(error = %err.message, "background activity sync failed");
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
}

fn init_tracing() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .try_init();
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true, "service": "zero-explorer-backend" }))
}

async fn network_health(State(state): State<AppState>) -> Json<NetworkHealth> {
    let started = Instant::now();
    let probe = rpc_call_value(&state, "eth_blockNumber", vec![]).await;
    let latency = started.elapsed().as_millis();

    match probe {
        Ok(_) => Json(NetworkHealth {
            backend_ok: true,
            rpc_ok: true,
            rpc_latency_ms: latency,
            checked_at_unix: current_unix_secs(),
            detail: "ok".to_string(),
        }),
        Err(err) => Json(NetworkHealth {
            backend_ok: true,
            rpc_ok: false,
            rpc_latency_ms: latency,
            checked_at_unix: current_unix_secs(),
            detail: err.message,
        }),
    }
}

async fn network_stats(State(state): State<AppState>) -> Result<Json<NetworkStats>, ApiError> {
    if let Some(cached) = {
        let guard = state.cache.read().await;
        guard
            .network_stats
            .as_ref()
            .and_then(CachedValue::get_if_fresh)
    } {
        return Ok(Json(cached));
    }

    let chain_id: String = rpc_call_str(&state, "eth_chainId", vec![]).await?;
    let network_id: String = rpc_call_str(&state, "net_version", vec![]).await?;
    let block_hex: String = rpc_call_str(&state, "eth_blockNumber", vec![]).await?;
    let latest_block_number = parse_u64_hex(&block_hex).unwrap_or(0);
    let mining: bool = rpc_call_bool(&state, "eth_mining", vec![]).await?;
    let hashrate: String = rpc_call_str(&state, "eth_hashrate", vec![]).await?;
    let gas_price: String = rpc_call_str(&state, "eth_gasPrice", vec![]).await?;
    let coinbase: String = rpc_call_str(&state, "eth_coinbase", vec![]).await?;

    let latest_zero_block = rpc_call_value(&state, "zero_getLatestBlock", vec![])
        .await
        .unwrap_or(Value::Null);

    let stats = NetworkStats {
        chain_id,
        network_id,
        latest_block_number,
        latest_block_hash: latest_zero_block
            .get("hash")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        latest_block_timestamp: latest_zero_block.get("timestamp").and_then(Value::as_u64),
        mining,
        hashrate,
        gas_price,
        coinbase,
    };

    {
        let mut guard = state.cache.write().await;
        guard.network_stats = Some(CachedValue {
            value: stats.clone(),
            created_at: Instant::now(),
        });
    }

    Ok(Json(stats))
}

async fn list_blocks(
    State(state): State<AppState>,
    Query(query): Query<Pagination>,
) -> Result<Json<BlockListResponse>, ApiError> {
    let limit = query.limit.unwrap_or(20).clamp(1, 100);
    let page = query.page.unwrap_or(1).max(1);
    let key = format!("{page}:{limit}");

    if let Some(cached) = {
        let guard = state.cache.read().await;
        guard
            .block_pages
            .get(&key)
            .and_then(CachedValue::get_if_fresh)
    } {
        return Ok(Json(cached));
    }

    let latest_hex: String = rpc_call_str(&state, "eth_blockNumber", vec![]).await?;
    let latest_num = parse_u64_hex(&latest_hex).unwrap_or(0);
    let skip = (page.saturating_sub(1)).saturating_mul(limit) as u64;
    let has_more = latest_num > skip;

    let mut items = Vec::new();
    for idx in 0..limit {
        let absolute = skip.saturating_add(idx as u64);
        if absolute > latest_num {
            break;
        }
        let n = latest_num.saturating_sub(absolute);
        if let Some(block) = fetch_block_by_number_best_effort(&state, n).await {
            record_address_hit(&state, &block.miner).await;
            items.push(block);
        }
    }

    let response = BlockListResponse {
        latest_number: latest_num,
        page,
        limit,
        has_more,
        items,
    };

    {
        let mut guard = state.cache.write().await;
        guard.block_pages.insert(
            key,
            CachedValue {
                value: response.clone(),
                created_at: Instant::now(),
            },
        );
    }

    Ok(Json(response))
}

async fn list_blocks_range(
    State(state): State<AppState>,
    Query(query): Query<BlockRangeQuery>,
) -> Result<Json<BlockRangeResponse>, ApiError> {
    let limit = query.limit.unwrap_or(50).clamp(1, 500);

    let latest_num =
        parse_u64_hex(&rpc_call_str(&state, "eth_blockNumber", vec![]).await?).unwrap_or(0);

    let to = query.to.unwrap_or(latest_num).min(latest_num);
    let from = query
        .from
        .unwrap_or_else(|| to.saturating_sub(limit as u64).saturating_add(1))
        .min(to);

    let key = format!("{from}:{to}:{limit}");
    if let Some(cached) = {
        let guard = state.cache.read().await;
        guard
            .block_ranges
            .get(&key)
            .and_then(CachedValue::get_if_fresh)
    } {
        return Ok(Json(cached));
    }

    let mut items = Vec::new();
    let mut n = to;
    while n >= from && items.len() < limit {
        if let Some(block) = fetch_block_by_number_best_effort(&state, n).await {
            items.push(block);
        }
        if n == 0 {
            break;
        }
        n = n.saturating_sub(1);
    }

    let resp = BlockRangeResponse { from, to, items };

    {
        let mut guard = state.cache.write().await;
        guard.block_ranges.insert(
            key,
            CachedValue {
                value: BlockRangeResponse {
                    from: resp.from,
                    to: resp.to,
                    items: resp.items.clone(),
                },
                created_at: Instant::now(),
            },
        );
    }

    Ok(Json(resp))
}

async fn get_block_by_number(
    State(state): State<AppState>,
    Path(number): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let number_hex = normalize_number_param(&number)?;
    let req_num = parse_u64_hex(&number_hex).unwrap_or(0);

    let block = rpc_call_value(
        &state,
        "eth_getBlockByNumber",
        vec![Value::String(number_hex), Value::Bool(true)],
    )
    .await
    .unwrap_or(Value::Null);

    if !block.is_null() {
        return Ok(Json(
            json!({ "source": "eth_getBlockByNumber", "block": block }),
        ));
    }

    let latest = rpc_call_value(&state, "zero_getLatestBlock", vec![]).await?;
    if let Some(parsed) = parse_zero_block(&latest) {
        if parsed.number == req_num {
            return Ok(Json(
                json!({ "source": "zero_getLatestBlock", "block": parsed }),
            ));
        }
    }

    Err(ApiError {
        code: "not_found",
        message: format!("block not found: {number}"),
    })
}

async fn get_account_overview(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Result<Json<AccountOverview>, ApiError> {
    let Some(normalized_address) = normalize_supported_address(&address) else {
        return Err(ApiError {
            code: "bad_request",
            message: format!("invalid address: {address}"),
        });
    };

    let balance_hex: String = rpc_call_str(
        &state,
        "eth_getBalance",
        vec![
            Value::String(normalized_address.clone()),
            Value::String("latest".to_string()),
        ],
    )
    .await?;

    let nonce_hex: String = rpc_call_str(
        &state,
        "eth_getTransactionCount",
        vec![
            Value::String(normalized_address.clone()),
            Value::String("latest".to_string()),
        ],
    )
    .await?;

    let account_val = rpc_call_value(
        &state,
        "zero_getAccount",
        vec![Value::String(normalized_address.clone())],
    )
    .await
    .unwrap_or(Value::Null);

    let utxos = rpc_call_value(
        &state,
        "zero_getUtxos",
        vec![Value::String(normalized_address.clone())],
    )
    .await
    .unwrap_or(Value::Array(vec![]));

    record_address_hit(&state, &normalized_address).await;

    Ok(Json(AccountOverview {
        address: normalized_address,
        balance_hex: account_val
            .get("balance")
            .and_then(Value::as_str)
            .unwrap_or(balance_hex.as_str())
            .to_string(),
        nonce_hex: account_val
            .get("nonce")
            .and_then(Value::as_str)
            .unwrap_or(nonce_hex.as_str())
            .to_string(),
        tx_count_hex: nonce_hex,
        utxos,
    }))
}

async fn list_recent_compute(
    State(state): State<AppState>,
    Query(query): Query<Pagination>,
) -> Json<RecentComputeResponse> {
    let limit = query.limit.unwrap_or(10).clamp(1, 50);
    let items = {
        let guard = state.activity.read().await;
        guard.recent_compute.iter().take(limit).cloned().collect()
    };
    Json(RecentComputeResponse { items })
}

async fn list_hot_addresses(
    State(state): State<AppState>,
    Query(query): Query<Pagination>,
) -> Json<HotAddressResponse> {
    let limit = query.limit.unwrap_or(10).clamp(1, 100);
    let mut items = {
        let guard = state.activity.read().await;
        guard
            .hot_addresses
            .values()
            .cloned()
            .collect::<Vec<HotAddressItem>>()
    };
    items.sort_by(|a, b| {
        b.hits
            .cmp(&a.hits)
            .then_with(|| b.last_seen_unix.cmp(&a.last_seen_unix))
    });
    items.truncate(limit);
    Json(HotAddressResponse { items })
}

async fn get_compute_result(
    State(state): State<AppState>,
    Path(tx_id): Path<String>,
) -> Result<Json<ComputeTxResultView>, ApiError> {
    if !is_hex_32(&tx_id) {
        return Err(ApiError {
            code: "bad_request",
            message: format!("invalid tx_id: {tx_id}"),
        });
    }
    let result = rpc_call_value(
        &state,
        "zero_getComputeTxResult",
        vec![Value::String(tx_id.clone())],
    )
    .await?;

    if result.is_null() {
        return Err(ApiError {
            code: "not_found",
            message: format!("compute tx not found: {tx_id}"),
        });
    }

    record_compute_observation(
        &state,
        &tx_id,
        result.get("ok").and_then(Value::as_bool).unwrap_or(true),
    )
    .await;

    Ok(Json(ComputeTxResultView { tx_id, result }))
}

async fn get_tx_detail(
    State(state): State<AppState>,
    Path(tx_id): Path<String>,
) -> Result<Json<ComputeTxResultView>, ApiError> {
    get_compute_result(State(state), Path(tx_id)).await
}

async fn get_object_view(
    State(state): State<AppState>,
    Path(object_id): Path<String>,
) -> Result<Json<ObjectOutputView>, ApiError> {
    if !is_hex_32(&object_id) {
        return Err(ApiError {
            code: "bad_request",
            message: format!("invalid object_id: {object_id}"),
        });
    }

    let value = rpc_call_value(
        &state,
        "zero_getObject",
        vec![Value::String(object_id.clone())],
    )
    .await?;

    if value.is_null() {
        return Err(ApiError {
            code: "not_found",
            message: format!("object not found: {object_id}"),
        });
    }

    Ok(Json(ObjectOutputView {
        id: object_id,
        kind: "object".to_string(),
        value,
    }))
}

async fn get_output_view(
    State(state): State<AppState>,
    Path(output_id): Path<String>,
) -> Result<Json<ObjectOutputView>, ApiError> {
    if !is_hex_32(&output_id) {
        return Err(ApiError {
            code: "bad_request",
            message: format!("invalid output_id: {output_id}"),
        });
    }

    let value = rpc_call_value(
        &state,
        "zero_getOutput",
        vec![Value::String(output_id.clone())],
    )
    .await?;

    if value.is_null() {
        return Err(ApiError {
            code: "not_found",
            message: format!("output not found: {output_id}"),
        });
    }

    Ok(Json(ObjectOutputView {
        id: output_id,
        kind: "output".to_string(),
        value,
    }))
}

async fn get_domain_view(
    State(state): State<AppState>,
    Path(domain_id): Path<u64>,
) -> Result<Json<Value>, ApiError> {
    if let Some(cached) = {
        let guard = state.cache.read().await;
        guard
            .domains
            .get(&domain_id)
            .and_then(CachedValue::get_if_fresh)
    } {
        return Ok(Json(cached));
    }

    let value = rpc_call_value(
        &state,
        "zero_getDomain",
        vec![Value::Number(domain_id.into())],
    )
    .await?;

    if value.is_null() {
        return Err(ApiError {
            code: "not_found",
            message: format!("domain not found: {domain_id}"),
        });
    }

    {
        let mut guard = state.cache.write().await;
        guard.domains.insert(
            domain_id,
            CachedValue {
                value: value.clone(),
                created_at: Instant::now(),
            },
        );
    }

    Ok(Json(value))
}

async fn search(
    State(state): State<AppState>,
    Path(query): Path<String>,
) -> Result<Json<SearchResponse>, ApiError> {
    if let Ok(n) = query.parse::<u64>() {
        if let Some(block) = fetch_block_by_number_best_effort(&state, n).await {
            return Ok(Json(SearchResponse {
                kind: "block".to_string(),
                primary_id: n.to_string(),
                canonical_route: format!("/blocks/{n}"),
                value: serde_json::to_value(block).unwrap_or(Value::Null),
            }));
        }

        let domain = rpc_call_value(&state, "zero_getDomain", vec![Value::Number(n.into())])
            .await
            .unwrap_or(Value::Null);
        if !domain.is_null() {
            return Ok(Json(SearchResponse {
                kind: "domain".to_string(),
                primary_id: n.to_string(),
                canonical_route: format!("/domains/{n}"),
                value: domain,
            }));
        }
    }

    if let Some(normalized_address) = normalize_supported_address(&query) {
        let account =
            get_account_overview(State(state.clone()), Path(normalized_address.clone())).await?;
        return Ok(Json(SearchResponse {
            kind: "address".to_string(),
            primary_id: normalized_address.clone(),
            canonical_route: format!("/accounts/{normalized_address}"),
            value: serde_json::to_value(account.0).unwrap_or(Value::Null),
        }));
    }

    if is_hex_32(&query) {
        let compute = rpc_call_value(
            &state,
            "zero_getComputeTxResult",
            vec![Value::String(query.clone())],
        )
        .await
        .unwrap_or(Value::Null);
        if !compute.is_null() {
            record_compute_observation(
                &state,
                &query,
                compute.get("ok").and_then(Value::as_bool).unwrap_or(true),
            )
            .await;
            return Ok(Json(SearchResponse {
                kind: "compute_tx".to_string(),
                primary_id: query.clone(),
                canonical_route: format!("/tx/{query}"),
                value: compute,
            }));
        }

        let object = rpc_call_value(&state, "zero_getObject", vec![Value::String(query.clone())])
            .await
            .unwrap_or(Value::Null);
        if !object.is_null() {
            return Ok(Json(SearchResponse {
                kind: "object".to_string(),
                primary_id: query.clone(),
                canonical_route: format!("/objects/{query}"),
                value: object,
            }));
        }

        let output = rpc_call_value(&state, "zero_getOutput", vec![Value::String(query.clone())])
            .await
            .unwrap_or(Value::Null);
        if !output.is_null() {
            return Ok(Json(SearchResponse {
                kind: "output".to_string(),
                primary_id: query.clone(),
                canonical_route: format!("/outputs/{query}"),
                value: output,
            }));
        }
    }

    Err(ApiError {
        code: "not_found",
        message: format!(
            "no result for query: {query}. supported: block-height | address | compute_tx/object_id/output_id | domain_id"
        ),
    })
}

async fn debug_cache(State(state): State<AppState>) -> Json<CacheDebugResponse> {
    let guard = state.cache.read().await;
    let now = Instant::now();

    let network_stats = match &guard.network_stats {
        Some(item) => CacheDebugSection {
            entries: 1,
            fresh: usize::from(
                now.duration_since(item.created_at) <= Duration::from_secs(CACHE_TTL_SECS),
            ),
            stale: usize::from(
                now.duration_since(item.created_at) > Duration::from_secs(CACHE_TTL_SECS),
            ),
        },
        None => CacheDebugSection {
            entries: 0,
            fresh: 0,
            stale: 0,
        },
    };

    let block_pages = summarize_cache_map(&guard.block_pages, now);
    let block_ranges = summarize_cache_map(&guard.block_ranges, now);
    let domains = summarize_cache_map(&guard.domains, now);

    Json(CacheDebugResponse {
        ttl_secs: CACHE_TTL_SECS,
        network_stats,
        block_pages,
        block_ranges,
        domains,
    })
}

async fn sync_background_activity_once(state: &AppState) -> Result<(), ApiError> {
    let latest_hex = rpc_call_str(state, "eth_blockNumber", vec![]).await?;
    let latest_num = parse_u64_hex(&latest_hex).unwrap_or(0);
    for n in latest_num.saturating_sub(2)..=latest_num {
        if let Some(block) = fetch_block_by_number_best_effort(state, n).await {
            record_address_hit(state, &block.miner).await;
        }
    }

    let coinbase = rpc_call_str(state, "eth_coinbase", vec![]).await?;
    record_address_hit(state, &coinbase).await;

    Ok(())
}

async fn fetch_block_by_number_best_effort(state: &AppState, number: u64) -> Option<ExplorerBlock> {
    let n_hex = format!("0x{number:x}");
    let block_val = rpc_call_value(
        state,
        "eth_getBlockByNumber",
        vec![Value::String(n_hex), Value::Bool(true)],
    )
    .await
    .unwrap_or(Value::Null);
    if let Some(parsed) = parse_eth_block(&block_val) {
        return Some(parsed);
    }

    let latest = rpc_call_value(state, "zero_getLatestBlock", vec![])
        .await
        .unwrap_or(Value::Null);
    parse_zero_block(&latest).filter(|b| b.number == number)
}

async fn record_compute_observation(state: &AppState, tx_id: &str, success: bool) {
    {
        let mut guard = state.activity.write().await;
        guard.recent_compute.retain(|it| it.tx_id != tx_id);
        guard.recent_compute.insert(
            0,
            RecentComputeItem {
                tx_id: tx_id.to_string(),
                seen_at_unix: current_unix_secs(),
                success,
            },
        );
        if guard.recent_compute.len() > 200 {
            guard.recent_compute.truncate(200);
        }
    }
    let _ = persist_activity(state).await;
}

async fn record_address_hit(state: &AppState, address: &str) {
    let Some(normalized_address) = normalize_supported_address(address) else {
        return;
    };
    {
        let mut guard = state.activity.write().await;
        let now = current_unix_secs();
        let entry = guard
            .hot_addresses
            .entry(normalized_address.to_ascii_lowercase())
            .or_insert(HotAddressItem {
                address: normalized_address.clone(),
                hits: 0,
                last_seen_unix: now,
            });
        entry.hits = entry.hits.saturating_add(1);
        entry.last_seen_unix = now;
        entry.address = normalized_address;
    }
    let _ = persist_activity(state).await;
}

async fn persist_activity(state: &AppState) -> Result<(), ApiError> {
    let snapshot = {
        let guard = state.activity.read().await;
        PersistedState {
            recent_compute: guard.recent_compute.clone(),
            hot_addresses: guard.hot_addresses.values().cloned().collect(),
        }
    };

    let content = serde_json::to_string_pretty(&snapshot).map_err(|e| ApiError {
        code: "internal",
        message: format!("serialize activity failed: {e}"),
    })?;

    if let Some(parent) = state.state_file.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            return Err(ApiError {
                code: "internal",
                message: format!("create state dir failed: {e}"),
            });
        }
    }

    fs::write(&state.state_file, content).map_err(|e| ApiError {
        code: "internal",
        message: format!("write state file failed: {e}"),
    })
}

async fn load_activity(path: PathBuf) -> ExplorerActivity {
    let raw = match fs::read_to_string(&path) {
        Ok(v) => v,
        Err(_) => {
            return ExplorerActivity {
                recent_compute: Vec::new(),
                hot_addresses: HashMap::new(),
            };
        }
    };

    match serde_json::from_str::<PersistedState>(&raw) {
        Ok(data) => {
            let mut map = HashMap::new();
            for item in data.hot_addresses {
                map.insert(item.address.to_ascii_lowercase(), item);
            }
            ExplorerActivity {
                recent_compute: data.recent_compute,
                hot_addresses: map,
            }
        }
        Err(e) => {
            error!(error = %e, "failed to parse persisted explorer state; using empty state");
            ExplorerActivity {
                recent_compute: Vec::new(),
                hot_addresses: HashMap::new(),
            }
        }
    }
}

fn current_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn normalize_number_param(number: &str) -> Result<String, ApiError> {
    if number.starts_with("0x") {
        return Ok(number.to_string());
    }
    number
        .parse::<u64>()
        .map(|n| format!("0x{n:x}"))
        .map_err(|_| ApiError {
            code: "bad_request",
            message: format!("invalid block number: {number}"),
        })
}

fn parse_zero_block(v: &Value) -> Option<ExplorerBlock> {
    if v.is_null() {
        return None;
    }
    let number_hex = v.get("number")?.as_str()?.to_string();
    let number = parse_u64_hex(&number_hex)?;
    Some(ExplorerBlock {
        number,
        number_hex,
        hash: v.get("hash")?.as_str()?.to_string(),
        parent_hash: v.get("parent_hash")?.as_str()?.to_string(),
        timestamp: v.get("timestamp")?.as_u64()?,
        difficulty: v
            .get("difficulty")
            .and_then(Value::as_str)
            .unwrap_or("0x0")
            .to_string(),
        nonce: v.get("nonce").and_then(Value::as_u64).unwrap_or(0),
        miner: v
            .get("coinbase")
            .and_then(Value::as_str)
            .unwrap_or("0x0000000000000000000000000000000000000000")
            .to_string(),
        tx_count: 0,
        extra_data: v
            .get("extra_data")
            .and_then(Value::as_str)
            .map(ToString::to_string),
    })
}

fn parse_eth_block(v: &Value) -> Option<ExplorerBlock> {
    if v.is_null() {
        return None;
    }
    let number_hex = v.get("number")?.as_str()?.to_string();
    let number = parse_u64_hex(&number_hex)?;
    Some(ExplorerBlock {
        number,
        number_hex,
        hash: v.get("hash")?.as_str()?.to_string(),
        parent_hash: v.get("parentHash")?.as_str()?.to_string(),
        timestamp: parse_u64_hex(v.get("timestamp")?.as_str()?)?,
        difficulty: v
            .get("difficulty")
            .and_then(Value::as_str)
            .unwrap_or("0x0")
            .to_string(),
        nonce: v
            .get("nonce")
            .and_then(Value::as_str)
            .and_then(parse_u64_hex)
            .unwrap_or(0),
        miner: v
            .get("miner")
            .and_then(Value::as_str)
            .unwrap_or("0x0000000000000000000000000000000000000000")
            .to_string(),
        tx_count: v
            .get("transactions")
            .and_then(Value::as_array)
            .map(|arr| arr.len())
            .unwrap_or(0),
        extra_data: v
            .get("extraData")
            .and_then(Value::as_str)
            .map(ToString::to_string),
    })
}

fn normalize_supported_address(value: &str) -> Option<String> {
    let trimmed = value.trim();

    if trimmed.starts_with("0x")
        && trimmed.len() == 42
        && trimmed[2..].chars().all(|c| c.is_ascii_hexdigit())
    {
        return Some(trimmed.to_string());
    }

    if trimmed.len() == 45 {
        let prefix = trimmed.get(..5)?;
        let body = trimmed.get(5..)?;
        if prefix.eq_ignore_ascii_case("ZER0x") && body.chars().all(|c| c.is_ascii_hexdigit()) {
            return Some(format!("ZER0x{body}"));
        }
    }

    None
}

fn is_hex_32(value: &str) -> bool {
    value.starts_with("0x")
        && value.len() == 66
        && value[2..].chars().all(|c| c.is_ascii_hexdigit())
}

async fn rpc_call_str(
    state: &AppState,
    method: &str,
    params: Vec<Value>,
) -> Result<String, ApiError> {
    let value = rpc_call_value(state, method, params).await?;
    value
        .as_str()
        .map(ToString::to_string)
        .ok_or_else(|| ApiError {
            code: "rpc_error",
            message: format!("rpc {method} returned non-string result"),
        })
}

async fn rpc_call_bool(
    state: &AppState,
    method: &str,
    params: Vec<Value>,
) -> Result<bool, ApiError> {
    let value = rpc_call_value(state, method, params).await?;
    value.as_bool().ok_or_else(|| ApiError {
        code: "rpc_error",
        message: format!("rpc {method} returned non-bool result"),
    })
}

async fn rpc_call_value(
    state: &AppState,
    method: &str,
    params: Vec<Value>,
) -> Result<Value, ApiError> {
    let body = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    });

    let response = state
        .client
        .post(&state.rpc_url)
        .json(&body)
        .send()
        .await
        .map_err(|e| ApiError {
            code: "rpc_error",
            message: format!("rpc {method} request failed: {e}"),
        })?;

    let status = response.status();
    let payload: JsonRpcEnvelope = response.json().await.map_err(|e| ApiError {
        code: "rpc_error",
        message: format!("rpc {method} decode failed: {e}"),
    })?;

    if !status.is_success() {
        return Err(ApiError {
            code: "rpc_error",
            message: format!("rpc {method} http status {status}"),
        });
    }
    if let Some(err) = payload.error {
        return Err(ApiError {
            code: "rpc_error",
            message: format!("rpc {method} returned error: {err}"),
        });
    }
    payload.result.ok_or_else(|| ApiError {
        code: "rpc_error",
        message: format!("rpc {method} missing result"),
    })
}

fn parse_u64_hex(input: &str) -> Option<u64> {
    let raw = input.strip_prefix("0x").unwrap_or(input);
    u64::from_str_radix(raw, 16).ok()
}

fn summarize_cache_map<K, V>(map: &HashMap<K, CachedValue<V>>, now: Instant) -> CacheDebugSection
where
    K: std::cmp::Eq + std::hash::Hash,
    V: Clone,
{
    let entries = map.len();
    let mut fresh = 0usize;
    for item in map.values() {
        if now.duration_since(item.created_at) <= Duration::from_secs(CACHE_TTL_SECS) {
            fresh += 1;
        }
    }
    CacheDebugSection {
        entries,
        fresh,
        stale: entries.saturating_sub(fresh),
    }
}
