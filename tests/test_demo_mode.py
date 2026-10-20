from app.services.demo_extraction import map_pdf, map_table, parties_pdf
from app.services.extraction import csv_to_table

DEFS = [
    {"field_key": "product_name", "label": "Product name"},
    {"field_key": "sku", "label": "SKU"},
    {"field_key": "sole_material", "label": "Sole material"},
]


def test_demo_table_maps_horizontal_label_value():
    table = csv_to_table(b"Field,Value\nProduct name,Trail Runner 2\nSKU,TR-2-BLK\n")
    items = map_table(table, DEFS)
    assert [(i["field_key"], i["value"]) for i in items] == [
        ("product_name", "Trail Runner 2"),
        ("sku", "TR-2-BLK"),
    ]
    assert items[0]["location"] == "CSV / Row 2 / Value"


def test_demo_pdf_maps_label_lines_and_parties():
    from pathlib import Path

    body = Path("samples/demo-shoe.pdf").read_bytes()
    items = {i["field_key"]: i for i in map_pdf(body, DEFS)}
    assert items["sku"]["value"] == "TR-2-BLK"
    assert items["sku"]["location"] == "Page 1"
    assert {p["name"] for p in parties_pdf(body)} == {
        "Demo Footwear Srl",
        "Demo Components Srl",
    }


def test_demo_table_ignores_unknown_labels():
    table = csv_to_table(b"Field,Value\nUnknown,42\n")
    assert map_table(table, DEFS) == []
