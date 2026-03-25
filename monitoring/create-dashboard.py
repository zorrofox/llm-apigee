#!/usr/bin/env python3
"""
LLM Gateway — Cloud Monitoring Dashboard Creator
Usage: python3 monitoring/create-dashboard.py [--project PROJECT_ID]

Creates (or recreates) the LLM Gateway observability dashboard with 8 panels:
  1. 请求速率（按模型）          — log-based metric, ALIGN_RATE
  2. 缓存命中 vs 未命中           — log-based metric, ALIGN_SUM
  3. HTTP 响应码速率（折线）      — Apigee native, ALIGN_RATE
  4. HTTP 响应码分布（堆叠柱状）  — Apigee native, ALIGN_SUM
  5. 请求后端（vertex/opencode）  — log-based metric, ALIGN_SUM
  6. 按 Publisher 分组            — log-based metric, ALIGN_SUM
  7. Token 用量 P99               — log-based metric, ALIGN_PERCENTILE_99
  8. Apigee 代理总请求量          — Apigee native, ALIGN_RATE

Metrics used:
  - logging.googleapis.com/user/llm_request_count  (label: model, cache_status, backend, publisher, status_code)
  - logging.googleapis.com/user/llm_token_usage    (label: model, publisher)
  - apigee.googleapis.com/proxy/response_count     (label: response_code)
  - apigee.googleapis.com/proxy/request_count      (no label grouping)
"""

import json, sys, subprocess, urllib.request, urllib.error, argparse

def get_token():
    return subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()

def api(method, path, body=None):
    url = f"https://monitoring.googleapis.com/v1{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url, data=data,
        headers={"Authorization": f"Bearer {get_token()}",
                 "Content-Type": "application/json"},
        method=method
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        err = json.loads(e.read())
        raise RuntimeError(f"HTTP {e.code}: {err.get('error',{}).get('message','?')}")


def line_widget(title, filt, group_label, y="req/s", period="60s",
                aligner="ALIGN_RATE", reducer="REDUCE_SUM"):
    return {
        "title": title,
        "xyChart": {
            "dataSets": [{"timeSeriesQuery": {"timeSeriesFilter": {
                "filter": filt,
                "aggregation": {
                    "alignmentPeriod": period,
                    "perSeriesAligner": aligner,
                    "crossSeriesReducer": reducer,
                    "groupByFields": [f"metric.labels.{group_label}"],
                }
            }}, "plotType": "LINE",
               "legendTemplate": "${" + f"metric.labels.{group_label}" + "}"}],
            "yAxis": {"label": y, "scale": "LINEAR"},
        }
    }


def bar_widget(title, filt, group_label, y="requests", period="300s",
               aligner="ALIGN_SUM", reducer="REDUCE_SUM"):
    return {
        "title": title,
        "xyChart": {
            "dataSets": [{"timeSeriesQuery": {"timeSeriesFilter": {
                "filter": filt,
                "aggregation": {
                    "alignmentPeriod": period,
                    "perSeriesAligner": aligner,
                    "crossSeriesReducer": reducer,
                    "groupByFields": [f"metric.labels.{group_label}"],
                }
            }}, "plotType": "STACKED_BAR",
               "legendTemplate": "${" + f"metric.labels.{group_label}" + "}"}],
            "yAxis": {"label": y, "scale": "LINEAR"},
        }
    }


def build_dashboard(project):
    REQ    = "logging.googleapis.com/user/llm_request_count"
    TOK    = "logging.googleapis.com/user/llm_token_usage"
    AP_RC  = "apigee.googleapis.com/proxy/response_count"
    AP_RQ  = "apigee.googleapis.com/proxy/request_count"
    G_RES  = 'resource.type="global"'
    AP_RES = f'resource.type="apigee.googleapis.com/Proxy" resource.label.proxy_name="llm-gateway"'

    return {
        "displayName": "LLM Gateway — Observability",
        "gridLayout": {
            "columns": "2",
            "widgets": [
                # 1. 请求速率（按模型）
                line_widget(
                    "请求速率（按模型）",
                    f'metric.type="{REQ}" {G_RES} metric.labels.model!=""',
                    "model", y="req/s"
                ),
                # 2. 缓存命中 vs 未命中
                bar_widget(
                    "缓存命中 vs 未命中（HIT / MISS）",
                    f'metric.type="{REQ}" {G_RES} metric.labels.cache_status!=""',
                    "cache_status", y="请求数"
                ),
                # 3. HTTP 响应码速率（Apigee 原生，含全部状态码）
                {
                    "title": "HTTP 响应码速率（200 / 401 / 429 / ...）",
                    "xyChart": {
                        "dataSets": [{"timeSeriesQuery": {"timeSeriesFilter": {
                            "filter": f'metric.type="{AP_RC}" {AP_RES}',
                            "aggregation": {
                                "alignmentPeriod": "60s",
                                "perSeriesAligner": "ALIGN_RATE",
                                "crossSeriesReducer": "REDUCE_SUM",
                                "groupByFields": ["metric.labels.response_code"],
                            }
                        }}, "plotType": "LINE",
                           "legendTemplate": "HTTP ${metric.labels.response_code}"}],
                        "yAxis": {"label": "resp/s", "scale": "LINEAR"},
                    }
                },
                # 4. HTTP 响应码分布（堆叠柱状）
                {
                    "title": "HTTP 响应码分布（200 / 4xx / 5xx）",
                    "xyChart": {
                        "dataSets": [{"timeSeriesQuery": {"timeSeriesFilter": {
                            "filter": f'metric.type="{AP_RC}" {AP_RES}',
                            "aggregation": {
                                "alignmentPeriod": "300s",
                                "perSeriesAligner": "ALIGN_SUM",
                                "crossSeriesReducer": "REDUCE_SUM",
                                "groupByFields": ["metric.labels.response_code"],
                            }
                        }}, "plotType": "STACKED_BAR",
                           "legendTemplate": "HTTP ${metric.labels.response_code}"}],
                        "yAxis": {"label": "请求数", "scale": "LINEAR"},
                    }
                },
                # 5. 请求后端（vertex / opencode）
                bar_widget(
                    "请求后端（vertex / opencode）",
                    f'metric.type="{REQ}" {G_RES} metric.labels.backend!=""',
                    "backend", y="请求数"
                ),
                # 6. 按 Publisher 分组
                bar_widget(
                    "按 Publisher 分组（google / anthropic / opencode / ...）",
                    f'metric.type="{REQ}" {G_RES} metric.labels.publisher!=""',
                    "publisher", y="请求数"
                ),
                # 7. Token 用量 P99（仅 MISS 请求）
                {
                    "title": "Token 用量 P99（MISS 请求，按模型）",
                    "xyChart": {
                        "dataSets": [{"timeSeriesQuery": {"timeSeriesFilter": {
                            "filter": f'metric.type="{TOK}" {G_RES} metric.labels.model!=""',
                            "aggregation": {
                                "alignmentPeriod": "300s",
                                "perSeriesAligner": "ALIGN_PERCENTILE_99",
                                "crossSeriesReducer": "REDUCE_SUM",
                                "groupByFields": ["metric.labels.model"],
                            }
                        }}, "plotType": "LINE",
                           "legendTemplate": "${metric.labels.model}"}],
                        "yAxis": {"label": "tokens", "scale": "LINEAR"},
                    }
                },
                # 8. Apigee 代理总请求量
                {
                    "title": "Apigee 代理总请求量（llm-gateway）",
                    "xyChart": {
                        "dataSets": [{"timeSeriesQuery": {"timeSeriesFilter": {
                            "filter": f'metric.type="{AP_RQ}" {AP_RES}',
                            "aggregation": {
                                "alignmentPeriod": "60s",
                                "perSeriesAligner": "ALIGN_RATE",
                                "crossSeriesReducer": "REDUCE_SUM",
                            }
                        }}, "plotType": "LINE",
                           "legendTemplate": "llm-gateway req/s"}],
                        "yAxis": {"label": "req/s", "scale": "LINEAR"},
                    }
                },
            ],
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Create LLM Gateway monitoring dashboard")
    parser.add_argument("--project", default="YOUR_PROJECT_ID", help="GCP project ID")
    parser.add_argument("--delete-existing", help="Dashboard ID to delete first")
    args = parser.parse_args()

    # Delete existing if requested
    if args.delete_existing:
        try:
            api("DELETE", f"/projects/{args.project}/dashboards/{args.delete_existing}")
            print(f"Deleted existing dashboard: {args.delete_existing}")
        except Exception as e:
            print(f"Note: could not delete {args.delete_existing}: {e}")

    # Create new dashboard
    dashboard = build_dashboard(args.project)
    result = api("POST", f"/projects/{args.project}/dashboards", dashboard)
    did = result["name"].split("/")[-1]

    print(f"\nDashboard created: {result['name']}")
    print(f"URL: https://console.cloud.google.com/monitoring/dashboards/custom/{did}?project={args.project}")
    print(f"\nTo recreate: python3 monitoring/create-dashboard.py --delete-existing {did}")


if __name__ == "__main__":
    main()
