import argparse
import asyncio
import logging
import sys
from app.rag.updater import corpus_updater
from app.rag.source_registry import source_registry

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("IP-SAKTI.UpdateCorpusCLI")

async def main_async():
    parser = argparse.ArgumentParser(
        description="Official Authoritative Legal Corpus Ingestion & Update Tool for IP-SAKTI"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Audit official sources for updates/checksum differences without mutating the active corpus"
    )
    parser.add_argument(
        "--source-id",
        type=str,
        help="Update a specific registered official source ID (e.g., SRC_IN_PATENTS_ACT_1970)"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Update all enabled registered official sources in the corpus"
    )

    args = parser.parse_args()

    if not args.all and not args.source_id and not args.dry_run:
        parser.print_help()
        sys.exit(1)

    source_ids = [args.source_id] if args.source_id else None

    print("\n========================================================")
    print("IP-SAKTI AUTHORITATIVE CORPUS INGESTION & UPDATE PIPELINE")
    print("========================================================")
    print(f"Mode: {'DRY-RUN (No Mutation)' if args.dry_run else 'LIVE INGESTION & PERSISTENCE'}")
    print(f"Target Sources: {args.source_id or 'ALL REGISTERED OFFICIAL SOURCES'}")
    print("========================================================\n")

    report = await corpus_updater.run_update_cycle(
        dry_run=args.dry_run,
        source_ids=source_ids
    )

    print("\n--------------------------------------------------------")
    print("EXECUTION REPORT SUMMARY")
    print("--------------------------------------------------------")
    print(f"Started At:               {report.started_at}")
    print(f"Completed At:             {report.completed_at}")
    print(f"Total Sources Checked:    {report.total_sources_checked}")
    print(f"Unchanged Sources:        {report.unchanged_sources}")
    print(f"Updated Sources:          {report.updated_sources}")
    print(f"New Sources Ingested:     {report.new_sources}")
    print(f"Failed Sources:           {report.failed_sources}")
    print("--------------------------------------------------------\n")

    for sid, res in report.source_results.items():
        status_tag = f"[{res.status}]"
        print(f"{status_tag:<12} {res.source_id} | {res.title}")
        if res.error:
            print(f"             Error: {res.error}")
        else:
            print(f"             URL: {res.canonical_url}")
            print(f"             Checksum: {res.new_checksum[:16]}... | Version: {res.new_version} | Chunks: {res.chunks_count}")

    print("\nCorpus update completed.")

def main():
    asyncio.run(main_async())

if __name__ == "__main__":
    main()
