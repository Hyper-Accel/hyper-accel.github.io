"""Publication dates are assigned once per bilingual post bundle."""
import importlib.util
import json
import os
import shutil
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/publication_dates.py"


class PublicationDatesTest(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SCRIPT.exists(), "publication date automation is not implemented")
        spec = importlib.util.spec_from_file_location("publication_dates", SCRIPT)
        assert spec is not None and spec.loader is not None
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.temp = tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR"))
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.ledger = self.root / "data/publications.json"

    def post(self, slug, language="", date="2026-01-01T10:00:00+09:00", extra=""):
        path = self.root / "content/posts" / slug / f"index{language}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"---\ndate: '{date}'\ntitle: Test\n{extra}---\n\n## Body\n", encoding="utf-8")
        return path

    def test_new_bilingual_post_receives_one_timestamp_and_is_idempotent(self):
        self.ledger.parent.mkdir()
        self.ledger.write_text('{"version": 1, "posts": {}}\n')
        ko = self.post("new-post")
        en = self.post("new-post", ".en")
        stamp = "2026-10-21T09:00:00+09:00"
        self.module.prepare(self.root, stamp)
        first = {p: p.read_bytes() for p in (ko, en, self.ledger)}
        for path in (ko, en):
            self.assertIn(f"date: '{stamp}'", path.read_text())
            self.assertIn("publication_id:", path.read_text())
        self.module.prepare(self.root, "2026-10-22T09:00:00+09:00")
        self.assertEqual(first, {p: p.read_bytes() for p in first})
        self.assertEqual(1, len(json.loads(self.ledger.read_text())["posts"]))

    def test_bootstrap_preserves_existing_dates_and_hotfix_bytes(self):
        ko = self.post("old-post")
        en = self.post("old-post", ".en", "2026-01-02T10:00:00+09:00")
        self.module.bootstrap(self.root)
        self.module.prepare(self.root, "2026-10-20T09:00:00+09:00")
        ko.write_text(ko.read_text() + "Hotfix\n")
        before = {p: p.read_bytes() for p in (ko, en, self.ledger)}
        self.module.prepare(self.root, "2026-10-21T09:00:00+09:00")
        self.assertEqual(before, {p: p.read_bytes() for p in before})

    def test_translation_added_later_inherits_original_publication_date(self):
        self.post("old-post", ".ko")
        self.module.bootstrap(self.root)
        en = self.post("old-post", ".en", "2026-10-21T09:00:00+09:00")
        self.module.prepare(self.root, "2026-10-22T09:00:00+09:00")
        self.assertIn("date: '2026-01-01T10:00:00+09:00'", en.read_text())

    def test_explicit_id_preserves_date_when_bundle_is_renamed(self):
        ko = self.post("old-post")
        self.module.bootstrap(self.root)
        target = ko.parent.with_name("renamed-post")
        ko.parent.rename(target)
        ko = target / ko.name
        ko.write_text(ko.read_text().replace("title: Test", "title: Test\npublication_id: old-post"))
        self.module.prepare(self.root, "2026-10-22T09:00:00+09:00")
        self.assertIn("date: '2026-01-01T10:00:00+09:00'", ko.read_text())
        self.assertEqual(1, len(json.loads(self.ledger.read_text())["posts"]))

    def test_legacy_ids_are_backfilled_before_directory_only_rename(self):
        ko = self.post("old-post")
        en = self.post("old-post", ".en")
        self.module.bootstrap(self.root)
        self.module.prepare(self.root, "2026-10-21T09:00:00+09:00")
        for path in (ko, en):
            self.assertIn("publication_id: 'old-post'", path.read_text())
        target = ko.parent.with_name("renamed-post")
        ko.parent.rename(target)
        self.module.prepare(self.root, "2026-10-22T09:00:00+09:00")
        for path in target.glob("*.md"):
            self.assertIn("date: '2026-01-01T10:00:00+09:00'", path.read_text())
        self.assertEqual(1, len(json.loads(self.ledger.read_text())["posts"]))

    def test_translation_added_to_renamed_bundle_inherits_bundle_id(self):
        ko = self.post("old-post")
        self.module.bootstrap(self.root)
        self.module.prepare(self.root, "2026-10-20T09:00:00+09:00")
        ko.parent.rename(ko.parent.with_name("renamed-post"))
        en = self.post("renamed-post", ".en", "2026-10-21T09:00:00+09:00")
        self.module.prepare(self.root, "2026-10-22T09:00:00+09:00")
        self.assertIn("publication_id: 'old-post'", en.read_text())
        self.assertIn("date: '2026-01-01T10:00:00+09:00'", en.read_text())

    def test_multiline_and_quoted_yaml_dates_are_replaced_without_corruption(self):
        self.module.bootstrap(self.root)
        for index, expression in enumerate(("date: >-\n  2026-01-01T10:00:00+09:00",
                                            "'date': '2026-01-01T10:00:00+09:00'")):
            ko = self.post(f"post-{index}")
            ko.write_text(ko.read_text().replace("date: '2026-01-01T10:00:00+09:00'", expression))
        self.module.prepare(self.root, "2026-10-21T09:00:00+09:00")
        for ko in (self.root / "content/posts").glob("*/index.md"):
            _, fields = self.module.read_post(ko)
            self.assertEqual("2026-10-21T09:00:00+09:00", fields["date"])
            self.assertEqual("Test", fields["title"])

    def test_flow_mapping_and_duplicate_keys_are_rejected_before_any_write(self):
        self.module.bootstrap(self.root)
        ko = self.post("new-post")
        for front in ("{date: '2026-01-01T10:00:00+09:00', title: Test}",
                      "date: '2026-01-01T10:00:00+09:00'\ndate: '2026-01-02T10:00:00+09:00'"):
            ko.write_text(f"---\n{front}\n---\n\nBody\n")
            before = ko.read_bytes()
            with self.assertRaises(ValueError):
                self.module.prepare(self.root, "2026-10-21T09:00:00+09:00")
            self.assertEqual(before, ko.read_bytes())

    def test_yaml_alias_cannot_modify_an_unmanaged_field_through_date(self):
        self.module.bootstrap(self.root)
        ko = self.post("new-post")
        ko.write_text("---\noriginalDate: &original '2026-01-01T10:00:00+09:00'\ndate: *original\ntitle: Test\n---\nBody\n")
        before = ko.read_bytes()
        with self.assertRaisesRegex(ValueError, "anchors|aliases"):
            self.module.prepare(self.root, "2026-10-21T09:00:00+09:00")
        self.assertEqual(before, ko.read_bytes())

    def test_drafts_and_scheduled_or_expired_posts_are_not_registered(self):
        self.module.bootstrap(self.root)
        paths = [self.post("draft", extra="draft: true\n"),
                 self.post("scheduled", extra="publishDate: '2027-01-01T00:00:00+09:00'\n"),
                 self.post("expired", extra="expiryDate: '2025-01-01T00:00:00+09:00'\n")]
        before = [p.read_bytes() for p in paths]
        self.module.prepare(self.root, "2026-10-21T09:00:00+09:00")
        self.assertEqual(before, [p.read_bytes() for p in paths])
        self.assertEqual({}, json.loads(self.ledger.read_text())["posts"])

    def test_missing_ledger_is_an_error_not_an_implicit_republication(self):
        self.post("old-post")
        with self.assertRaisesRegex(ValueError, "Missing publication ledger"):
            self.module.prepare(self.root, "2026-10-21T09:00:00+09:00")

    def deployment_plan(self):
        self.module.bootstrap(self.root)
        ko = self.post("new-post")
        self.post("new-post", ".en")
        build = self.root / "build-checkout"
        shutil.copytree(self.root / "content", build / "content")
        shutil.copytree(self.root / "data", build / "data")
        plan = self.module.prepare(build, "2026-10-21T09:00:00+09:00")
        return ko, plan

    def test_finalize_preserves_concurrent_hotfix_and_is_idempotent(self):
        ko, plan = self.deployment_plan()
        ko.write_text(ko.read_text().replace("title: Test", "title: Hotfix") + "Concurrent edit\n")
        self.module.finalize(self.root, plan)
        self.assertIn("title: Hotfix", ko.read_text())
        self.assertIn("Concurrent edit", ko.read_text())
        self.assertIn("date: '2026-10-21T09:00:00+09:00'", ko.read_text())
        before = {p: p.read_bytes() for p in (ko, self.ledger)}
        self.module.finalize(self.root, plan)
        self.assertEqual(before, {p: p.read_bytes() for p in before})

    def test_failed_deployment_leaves_source_dates_and_ledger_unchanged(self):
        ko, plan = self.deployment_plan()
        # Build preparation happens in a separate checkout; no finalize on failure.
        self.assertTrue(plan["posts"])
        self.assertIn("date: '2026-01-01T10:00:00+09:00'", ko.read_text())
        self.assertEqual({}, json.loads(self.ledger.read_text())["posts"])

    def test_finalize_rejects_conflicting_registry_without_partial_writes(self):
        ko, plan = self.deployment_plan()
        ledger = json.loads(self.ledger.read_text())
        ledger["posts"]["new-post"] = {
            "date": "2026-10-20T09:00:00+09:00", "dates": {"ko": "2026-10-20T09:00:00+09:00"}}
        self.ledger.write_text(json.dumps(ledger))
        before = ko.read_bytes()
        with self.assertRaisesRegex(ValueError, "Conflicting publication"):
            self.module.finalize(self.root, plan)
        self.assertEqual(before, ko.read_bytes())

    def test_finalize_does_not_resurrect_concurrently_deleted_posts(self):
        ko, plan = self.deployment_plan()
        shutil.rmtree(ko.parent)
        self.module.finalize(self.root, plan)
        self.assertFalse(ko.exists())
        self.assertIn("new-post", json.loads(self.ledger.read_text())["posts"])

    def test_crlf_comments_and_body_are_preserved(self):
        self.module.bootstrap(self.root)
        ko = self.post("new-post")
        ko.write_bytes(ko.read_bytes().replace(b"title: Test", b"# A comment\ntitle: Test")
                       .replace(b"\n", b"\r\n"))
        self.module.prepare(self.root, "2026-10-21T09:00:00+09:00")
        text = ko.read_bytes()
        self.assertIn(b"# A comment\r\ntitle: Test", text)
        self.assertTrue(text.endswith(b"---\r\n\r\n## Body\r\n"))
        self.assertNotIn(b"\n", text.replace(b"\r\n", b""))

    def test_deployment_does_not_commit_or_mutate_publication_source(self):
        yaml = self.module.yaml
        source = (SCRIPT.parents[1] / ".github/workflows/hugo.yml").read_text()
        workflow = yaml.safe_load(source)
        self.assertIs(False, workflow["concurrency"]["cancel-in-progress"])
        self.assertEqual("read", workflow["permissions"]["contents"])
        self.assertEqual({"build", "deploy"}, set(workflow["jobs"]))
        for job in workflow["jobs"].values():
            self.assertNotIn(job.get("permissions"), ("write-all",))
            if isinstance(job.get("permissions"), dict):
                self.assertNotEqual("write", job["permissions"].get("contents"))
        for forbidden in ("git commit", "git push", "publication_dates.py", "publication-plan",
                          "record_publication_dates", "check_publication_recovery"):
            self.assertNotIn(forbidden, source)
        self.assertFalse(SCRIPT.with_name("record_publication_dates.sh").exists())
        self.assertFalse(SCRIPT.with_name("check_publication_recovery.py").exists())


if __name__ == "__main__":
    unittest.main()
