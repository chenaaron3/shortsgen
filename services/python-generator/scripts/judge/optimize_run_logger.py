from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class OptimizeRunLogger:
    """Handles file outputs and status logs for optimization runs."""

    def __init__(self, output_root: Path):
        self.output_root = output_root
        self.output_root.mkdir(parents=True, exist_ok=True)

    def info(self, message: str) -> None:
        print(message)

    @staticmethod
    def save_prompt(path: Path, prompt_text: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(prompt_text, encoding="utf-8")

    @staticmethod
    def _to_jsonable_units(units: list[Any]) -> list[dict[str, Any]]:
        return [
            {
                "unit_id": unit.unit_id,
                "source": unit.source,
                "word_count": unit.word_count,
                "text": unit.text,
            }
            for unit in units
        ]

    def write_dataset(
        self,
        *,
        seed_urls: list[str],
        seed_file: str,
        target_count: int,
        min_words: int,
        max_words: int,
        splits: dict[str, list[Any]],
    ) -> None:
        (self.output_root / "dataset.json").write_text(
            json.dumps(
                {
                    "seed_urls": seed_urls,
                    "seed_file": seed_file,
                    "target_count": target_count,
                    "min_words": min_words,
                    "max_words": max_words,
                    "splits": {
                        "train": self._to_jsonable_units(splits["train"]),
                        "val": self._to_jsonable_units(splits["val"]),
                        "test": self._to_jsonable_units(splits["test"]),
                    },
                },
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

    def write_baseline(
        self,
        *,
        prompt_text: str,
        val_metrics: dict[str, float],
        test_metrics: dict[str, float],
        val_records: list[dict[str, Any]],
        test_records: list[dict[str, Any]],
    ) -> None:
        self.save_prompt(self.output_root / "prompts" / "prompt.v0.baseline.md", prompt_text)
        (self.output_root / "baseline.json").write_text(
            json.dumps(
                {
                    "val_metrics": val_metrics,
                    "test_metrics": test_metrics,
                    "val_records": val_records,
                    "test_records": test_records,
                },
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

    def round_dir(self, round_idx: int) -> Path:
        rd = self.output_root / f"round-{round_idx:02d}"
        rd.mkdir(parents=True, exist_ok=True)
        return rd

    @staticmethod
    def write_round_train(
        round_dir: Path,
        *,
        train_metrics: dict[str, float],
        train_records: list[dict[str, Any]],
    ) -> None:
        (round_dir / "train.json").write_text(
            json.dumps({"metrics": train_metrics, "records": train_records}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    @staticmethod
    def write_round_eval(
        round_dir: Path,
        *,
        round_idx: int,
        gate_ok: bool,
        gate_reasons: list[str],
        val_metrics: dict[str, float],
        test_metrics: dict[str, float],
        val_records: list[dict[str, Any]],
        test_records: list[dict[str, Any]],
    ) -> None:
        (round_dir / "eval.json").write_text(
            json.dumps(
                {
                    "round": round_idx,
                    "gate_ok": gate_ok,
                    "gate_reasons": gate_reasons,
                    "val_metrics": val_metrics,
                    "test_metrics": test_metrics,
                    "val_records": val_records,
                    "test_records": test_records,
                },
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

    def write_summary(self, payload: dict[str, Any]) -> None:
        (self.output_root / "rounds-summary.json").write_text(
            json.dumps(payload, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
