#!/usr/bin/env python3
"""Refuse to re-date a post if a prior successful deploy is not recorded."""
import json
import os
import subprocess

RECORD_JOB = "Record successful publication dates"


def check_jobs(jobs):
    deployed = any(job["name"] == "deploy" and job["conclusion"] == "success" for job in jobs)
    recorded = any(job["name"] == RECORD_JOB and job["conclusion"] == "success" for job in jobs)
    if deployed and not recorded:
        raise ValueError(
            "Previous Pages deployment succeeded but publication dates were not recorded. "
            "Re-run failed jobs on that run before a new build; do not re-run all jobs."
        )
    return deployed


def api(endpoint):
    return json.loads(subprocess.check_output(["gh", "api", endpoint], text=True))


def run_jobs(prefix, run_id):
    # A failed-jobs rerun may contain only record-publication. Include earlier
    # attempts as well, otherwise its successful Pages deploy becomes invisible.
    result = api(f"{prefix}/runs/{run_id}/jobs?per_page=100&filter=all")
    if result["total_count"] > len(result["jobs"]):
        raise ValueError("Incomplete job history; manually verify publication recovery")
    return result["jobs"]


def main():
    repo = os.environ["GITHUB_REPOSITORY"]
    current = int(os.environ["GITHUB_RUN_ID"])
    attempt = int(os.environ.get("GITHUB_RUN_ATTEMPT", "1"))
    prefix = f"repos/{repo}/actions"
    if attempt > 1:
        jobs = run_jobs(prefix, current)
        # Rerunning all jobs after a partial success would discard the saved date.
        check_jobs(jobs)
    runs = api(f"{prefix}/workflows/hugo.yml/runs?branch=main&per_page=100")["workflow_runs"]
    for run in sorted(runs, key=lambda run: run["run_number"], reverse=True):
        if run["id"] == current or run["run_number"] >= int(os.environ["GITHUB_RUN_NUMBER"]):
            continue
        if run["status"] != "completed":
            continue
        if run["conclusion"] == "success":
            break
        jobs = run_jobs(prefix, run["id"])
        check_jobs(jobs)
    else:
        if len(runs) >= 100:
            raise ValueError("No successful baseline found in recent runs; manually verify publication recovery")
    print("No unrecorded successful deployment; safe to assign first-publication dates")


if __name__ == "__main__":
    main()
