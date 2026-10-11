"""Measure local HTTP latency; these results do not estimate production/LLM capacity."""
import argparse
import json
import math
import platform
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from http.client import HTTPException
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPCookieProcessor, ProxyHandler, Request, build_opener
from uuid import uuid4


def client():
    return build_opener(ProxyHandler({}), HTTPCookieProcessor(CookieJar()))


def call(opener, base, path, method="GET", body=None):
    encoded = json.dumps(body).encode() if body is not None else None
    request = Request(base + path, data=encoded, method=method,
                      headers={"Content-Type": "application/json"})
    started = time.perf_counter()
    status, content = 0, {}
    try:
        with opener.open(request, timeout=30) as response:
            status = response.status
            content = json.load(response)
    except HTTPError as error:
        status = error.code
    except (URLError, TimeoutError, ConnectionError, HTTPException):
        status, content = 0, {}
    return status, content, (time.perf_counter() - started) * 1000


def summarize(samples):
    latencies = sorted(sample["ms"] for sample in samples)
    return {
        "requests": len(samples), "succeeded": sum(200 <= s["status"] < 300 for s in samples),
        "status_counts": {str(status): sum(s["status"] == status for s in samples)
                          for status in sorted({s["status"] for s in samples})},
        "mean_ms": round(sum(latencies) / len(latencies), 2),
        "p50_ms": round(latencies[math.ceil(len(latencies) * .5) - 1], 2),
        "p95_ms": round(latencies[math.ceil(len(latencies) * .95) - 1], 2),
        "max_ms": round(max(latencies), 2),
    }


def health_group(base, count, workers):
    def request(_):
        status, _, ms = call(client(), base, "/api/health")
        return {"status": status, "ms": ms}
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        samples = list(pool.map(request, range(count)))
    return {**summarize(samples), "workers": workers,
            "elapsed_seconds": round(time.perf_counter() - started, 3)}


def flow(base):
    opener, samples = client(), []
    def request(label, path, method="GET", body=None):
        status, content, ms = call(opener, base, path, method, body)
        samples.append({"operation": label, "status": status, "ms": ms})
        if not 200 <= status < 300:
            raise RuntimeError(label)
        return content
    try:
        request("session", "/api/session", "POST", {})
        state = request("start", "/api/journeys/start", "POST",
                        {"role_id": "scholar", "mode": "virtual"})["snapshot"]
        def action(label, path, extra):
            return request(label, path, "POST", {
                "journey_id": state["journeyId"], "state_version": state["stateVersion"],
                "request_id": str(uuid4()), **extra,
            })
        state = action("arrive", "/api/location/trigger", {"spot_id": "pingjiang"})["snapshot"]
        state = action("chat_local_refusal", "/api/chat/message",
                       {"npc_id": "zhou-bo", "message": "介绍平江路"})["snapshot"]
        state = action("verify", "/api/tasks/task-shuangqipan/verify", {"answer": "B"})["snapshot"]
        request("report", "/api/report")
    except RuntimeError:
        pass
    finally:
        status, _, ms = call(opener, base, "/api/session", "DELETE")
        samples.append({"operation": "delete_session", "status": status, "ms": ms})
    return samples


def flow_group(base, count, workers):
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        flows = list(pool.map(lambda _: flow(base), range(count)))
    samples = [sample for row in flows for sample in row]
    by_operation = defaultdict(list)
    for sample in samples:
        by_operation[sample["operation"]].append(sample)
    return {**summarize(samples), "flows": count, "workers": workers,
            "elapsed_seconds": round(time.perf_counter() - started, 3),
            "by_operation": {key: summarize(values) for key, values in by_operation.items()}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8001")
    parser.add_argument("--output", type=Path, default=Path("../data/testsets/performance-results.json"))
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    # Prevent accidental load against a remote production site.
    if not base.startswith(("http://127.0.0.1:", "http://localhost:")):
        parser.error("benchmark requires a local loopback HTTP base URL")
    if call(client(), base, "/api/health")[0] != 200:
        parser.error("migrate/seed/start the local server first")
    for _ in range(5):
        call(client(), base, "/api/health")
    result = {
        "generated_at": datetime.now(UTC).isoformat(), "base_url": base,
        "environment": {"os": platform.system(), "python": platform.python_version(),
                        "database": "SQLite demo", "server": "single uvicorn process"},
        "limitations": ["本机回环请求，不能外推生产吞吐或公网延迟", "未调用真实LLM/Embedding",
                        "聊天使用无审核资料的本地拒答；不是生成或检索性能", "临时匿名旅程，结束后删除"],
        "groups": {
            "health_serial": health_group(base, 50, 1),
            "health_concurrent": health_group(base, 200, 10),
            "journey_serial": flow_group(base, 5, 1),
            "journey_concurrent": flow_group(base, 10, 5),
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["groups"], ensure_ascii=False))
    return int(any(g["requests"] != g["succeeded"] for g in result["groups"].values()))


if __name__ == "__main__":
    raise SystemExit(main())
